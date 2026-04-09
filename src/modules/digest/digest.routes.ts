import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authenticate, requirePlan } from '../../middleware/auth'
import * as digestService from './digest.service'
import { triggerManualDigest } from '../scheduler/queues'
import { db } from '../../database/connection'

const router = Router()

// ============================================
// GET /digests — listar relatórios
// ============================================
router.get('/', authenticate, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10
  const digests = await digestService.listDigests(req.user!.id, limit)
  res.json({ success: true, data: digests })
})

// ============================================
// GET /digests/:id — buscar relatório completo
// ============================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const digest = await digestService.getDigestById(req.user!.id, req.params.id)
  if (!digest) {
    return res.status(404).json({ success: false, error: 'Relatório não encontrado' })
  }
  res.json({ success: true, data: digest })
})

// ============================================
// POST /digests/manual — gerar relatório agora
// ============================================
router.post('/manual', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      period_hours: z.number().min(1).max(168).optional().default(24),
      format: z.enum(['short', 'detailed', 'executive']).optional().default('detailed'),
      channels: z.array(z.enum(['whatsapp', 'email', 'dashboard'])).optional(),
    })

    const options = schema.parse(req.body)
    const jobId = await triggerManualDigest(req.user!.id, {
      periodHours: options.period_hours,
      format: options.format,
      channels: options.channels,
    })

    res.json({
      success: true,
      message: 'Relatório sendo gerado. Disponível em instantes.',
      data: { job_id: jobId },
    })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /digests/schedule — buscar agendamento
// ============================================
router.get('/schedule/config', authenticate, async (req: Request, res: Response) => {
  const result = await db.query(
    'SELECT * FROM schedules WHERE user_id = $1',
    [req.user!.id]
  )
  res.json({ success: true, data: result.rows[0] || null })
})

// ============================================
// PUT /digests/schedule — configurar agendamento
// ============================================
router.put('/schedule/config', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      cron_expression: z.string().optional(),
      delivery_channels: z
        .array(z.enum(['whatsapp', 'email', 'dashboard']))
        .min(1)
        .optional(),
      report_format: z.enum(['short', 'detailed', 'executive']).optional(),
      is_active: z.boolean().optional(),
    })

    const data = schema.parse(req.body)

    // Validar cron se fornecido
    if (data.cron_expression) {
      const cron = await import('node-cron')
      if (!cron.validate(data.cron_expression)) {
        return res.status(400).json({ success: false, error: 'Expressão cron inválida' })
      }
    }

    // Verifica se já existe schedule; se sim, UPDATE; senão, INSERT
    const existing = await db.query(
      'SELECT id FROM schedules WHERE user_id = $1 LIMIT 1',
      [req.user!.id]
    )

    if (existing.rows.length > 0) {
      // UPDATE campos fornecidos
      const fields: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (data.cron_expression !== undefined) {
        fields.push(`cron_expression = $${idx++}`)
        values.push(data.cron_expression)
      }
      if (data.delivery_channels !== undefined) {
        fields.push(`delivery_channels = $${idx++}`)
        values.push(data.delivery_channels)
      }
      if (data.report_format !== undefined) {
        fields.push(`report_format = $${idx++}`)
        values.push(data.report_format)
      }
      if (data.is_active !== undefined) {
        fields.push(`is_active = $${idx++}`)
        values.push(data.is_active)
      }

      if (fields.length > 0) {
        fields.push(`updated_at = NOW()`)
        values.push(existing.rows[0].id)
        await db.query(
          `UPDATE schedules SET ${fields.join(', ')} WHERE id = $${idx}`,
          values
        )
      }
    } else {
      await db.query(
        `INSERT INTO schedules (user_id, cron_expression, delivery_channels, report_format, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user!.id,
          data.cron_expression || '0 22 * * *',
          data.delivery_channels || ['dashboard'],
          data.report_format || 'detailed',
          data.is_active ?? true,
        ]
      )
    }

    res.json({ success: true, message: 'Agendamento atualizado' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /digests/keywords — listar keywords
// ============================================
router.get('/keywords/list', authenticate, async (req: Request, res: Response) => {
  const result = await db.query(
    'SELECT * FROM keywords WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  )
  res.json({ success: true, data: result.rows })
})

// ============================================
// POST /digests/keywords — adicionar keyword
// ============================================
router.post('/keywords', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      word: z.string().min(2).max(100),
      type: z.enum(['urgent', 'ignore', 'highlight']).default('urgent'),
      case_sensitive: z.boolean().default(false),
    })

    const data = schema.parse(req.body)

    // Verificar limite do plano
    const countResult = await db.query(
      'SELECT COUNT(*) FROM keywords WHERE user_id = $1',
      [req.user!.id]
    )
    const planResult = await db.query(
      'SELECT max_keywords FROM plans WHERE name = $1',
      [req.user!.plan]
    )

    const count = parseInt(countResult.rows[0].count)
    const maxKeywords = planResult.rows[0]?.max_keywords || 5

    if (count >= maxKeywords) {
      return res.status(403).json({
        success: false,
        error: `Limite de ${maxKeywords} palavras-chave atingido para seu plano`,
      })
    }

    await db.query(
      `INSERT INTO keywords (user_id, word, type, case_sensitive)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, word) DO UPDATE SET type = $3, case_sensitive = $4`,
      [req.user!.id, data.word, data.type, data.case_sensitive]
    )

    res.status(201).json({ success: true, message: 'Palavra-chave adicionada' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// DELETE /digests/keywords/:id
// ============================================
router.delete('/keywords/:id', authenticate, async (req: Request, res: Response) => {
  await db.query(
    'DELETE FROM keywords WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  )
  res.json({ success: true, message: 'Palavra-chave removida' })
})

export default router
