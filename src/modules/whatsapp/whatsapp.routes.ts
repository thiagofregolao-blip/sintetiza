import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { authenticate } from '../../middleware/auth'
import * as unipileService from './unipile.service'
import { saveMessage, listMessages } from '../messages/messages.service'
import { UnipileWebhookEvent, ApiResponse } from '../../types'
import { db } from '../../database/connection'
import { handleQRStream, notifyQRUpdate, notifyAccountConnected } from './qr-stream'

const router = Router()

// ============================================
// POST /whatsapp/connect — iniciar conexão + QR
// ============================================
router.post('/connect', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await unipileService.initiateConnection(req.user!.id)
    res.json({ success: true, data: result } as ApiResponse)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/status — status da sessão
// ============================================
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const session = await unipileService.getSessionStatus(req.user!.id)
  res.json({
    success: true,
    data: session
      ? {
          status: session.status,
          display_name: session.display_name,
          connected_at: session.connected_at,
          last_activity_at: session.last_activity_at,
        }
      : null,
  })
})

// ============================================
// DELETE /whatsapp/disconnect
// ============================================
router.delete('/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    await unipileService.disconnect(req.user!.id)
    res.json({ success: true, message: 'WhatsApp desconectado' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/groups — listar grupos
// ============================================
router.get('/groups', authenticate, async (req: Request, res: Response) => {
  const groups = await unipileService.listGroups(req.user!.id)
  res.json({ success: true, data: groups })
})

// ============================================
// PUT /whatsapp/groups/:groupId — configurar grupo
// ============================================
router.put('/groups/:groupId', authenticate, async (req: Request, res: Response) => {
  try {
    const { is_monitored, is_excluded } = req.body
    await unipileService.updateGroupConfig(req.user!.id, req.params.groupId, {
      is_monitored,
      is_excluded,
    })
    res.json({ success: true, message: 'Configuração atualizada' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// POST /whatsapp/sync — sincronizar grupos manualmente
// ============================================
router.post('/sync', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await unipileService.getSessionStatus(req.user!.id)
    if (!session?.unipile_account_id || session.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp não conectado' })
    }
    await unipileService.syncGroups(req.user!.id, session.unipile_account_id)
    res.json({ success: true, message: 'Grupos sincronizados' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/messages — listar mensagens
// Query params: group_id, limit, offset, min_urgency, only_mentions
// ============================================
router.get('/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = req.query.group_id as string | undefined
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const minUrgency = req.query.min_urgency ? Number(req.query.min_urgency) : undefined
    const onlyMentions = req.query.only_mentions === 'true'

    const messages = await listMessages(req.user!.id, {
      groupId,
      limit,
      offset,
      minUrgency,
      onlyMentions,
    })

    res.json({ success: true, data: messages } as ApiResponse)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/qr-stream — SSE para QR Code em tempo real
// Autenticação via query param ?token=JWT
// ============================================
router.get('/qr-stream', handleQRStream)

// ============================================
// POST /whatsapp/webhook — recebe eventos do Unipile
// IMPORTANTE: não tem autenticação JWT, usa HMAC
// ============================================
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Parse body — express.raw() nos dá um Buffer
    let body: any = req.body
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf8'))
      } catch {
        console.error('[Webhook] Body não é JSON válido')
        return res.status(400).json({ error: 'Invalid JSON' })
      }
    }

    // Log detalhado pra debug — remover depois que estiver estável
    console.log('[Webhook] Headers:', JSON.stringify({
      'x-unipile-signature': req.headers['x-unipile-signature'],
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    }))
    console.log('[Webhook] Body:', JSON.stringify(body).substring(0, 800))

    // Validação de assinatura: apenas warning se falhar, não bloqueia
    const signature = req.headers['x-unipile-signature'] as string | undefined
    if (signature && process.env.UNIPILE_WEBHOOK_SECRET) {
      if (!validateWebhookSignature(body, signature)) {
        console.warn('[Webhook] Assinatura inválida (mas processando mesmo assim)')
      }
    }

    // Responder imediatamente ao Unipile (não bloquear)
    res.status(200).json({ received: true })

    // Processar o evento de forma assíncrona
    processWebhookEvent(body as UnipileWebhookEvent).catch(err => {
      console.error('[Webhook] Erro no processamento:', err)
    })
  } catch (err: any) {
    console.error('[Webhook] Erro:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

// ============================================
// Normaliza o tipo de evento — Unipile pode usar diferentes formatos
// ============================================
const normalizeEventType = (raw: any): string => {
  // Possíveis campos onde o tipo pode estar
  const candidates = [
    raw?.event,
    raw?.type,
    raw?.webhook,
    raw?.event_type,
    raw?.name,
  ].filter(Boolean)

  if (candidates.length === 0) return 'unknown'

  const type = String(candidates[0]).toLowerCase()

  // Mapeia variações conhecidas para nossos identificadores canônicos
  if (/message.*(received|create)/.test(type) || type === 'new_message' || type === 'message') {
    return 'message_received'
  }
  if (/account.*(connect|ready|active)/.test(type) || type === 'creation_success') {
    return 'account_connected'
  }
  if (/account.*(disconnect|logout)/.test(type)) {
    return 'account_disconnected'
  }
  if (/account.*(error|fail)/.test(type)) {
    return 'account_error'
  }
  if (/qr(code)?/.test(type) || type === 'checkpoint') {
    return 'qrcode'
  }
  return type
}

// ============================================
// Extrai account_id de várias estruturas possíveis
// ============================================
const extractAccountId = (raw: any): string | undefined => {
  return (
    raw?.account_id ||
    raw?.accountId ||
    raw?.data?.account_id ||
    raw?.data?.accountId ||
    raw?.account?.id
  )
}

// ============================================
// Processar evento do webhook
// ============================================
const processWebhookEvent = async (rawEvent: any): Promise<void> => {
  const eventType = normalizeEventType(rawEvent)
  const accountId = extractAccountId(rawEvent)
  console.log(`[Webhook] Evento normalizado: ${eventType}, account: ${accountId}`)

  // Injeta os campos normalizados no event para o resto do código funcionar
  const event = {
    ...rawEvent,
    event: eventType,
    account_id: accountId,
    data: rawEvent.data || rawEvent,
  } as UnipileWebhookEvent

  switch (event.event) {
    case 'account_connected':
      await unipileService.handleAccountConnected(
        event.account_id,
        event.data?.sender?.id,
        event.data?.sender?.display_name
      )
      // Notificar SSE do usuário que WhatsApp conectou
      {
        const connSession = await db.query(
          'SELECT user_id FROM whatsapp_sessions WHERE unipile_account_id = $1',
          [event.account_id]
        )
        if (connSession.rows.length > 0) {
          notifyAccountConnected(
            connSession.rows[0].user_id,
            event.data?.sender?.id,
            event.data?.sender?.display_name
          )
        }
      }
      break

    case 'account_disconnected':
    case 'account_error':
      await db.query(
        `UPDATE whatsapp_sessions SET
           status = $2,
           error_message = $3,
           updated_at = NOW()
         WHERE unipile_account_id = $1`,
        [
          event.account_id,
          event.event === 'account_disconnected' ? 'disconnected' : 'error',
          event.event === 'account_error' ? 'Erro de conexão reportado pelo Unipile' : null,
        ]
      )
      break

    case 'message_received':
      // Buscar sessão pelo account_id
      const sessionResult = await db.query(
        `SELECT ws.id, ws.user_id FROM whatsapp_sessions ws
         WHERE ws.unipile_account_id = $1 AND ws.status = 'connected'`,
        [event.account_id]
      )

      if (sessionResult.rows.length === 0) {
        console.warn(`[Webhook] Sessão não encontrada para account ${event.account_id}`)
        return
      }

      const { id: sessionId, user_id: userId } = sessionResult.rows[0]

      // Atualizar last_activity
      await db.query(
        'UPDATE whatsapp_sessions SET last_activity_at = NOW() WHERE id = $1',
        [sessionId]
      )

      // Salvar mensagem
      await saveMessage(userId, sessionId, event)
      break

    case 'qrcode':
      // QR Code atualizado
      await db.query(
        `UPDATE whatsapp_sessions SET
           qr_code = $2,
           qr_expires_at = NOW() + INTERVAL '60 seconds',
           updated_at = NOW()
         WHERE unipile_account_id = $1`,
        [event.account_id, event.data?.text]
      )
      // Notificar SSE do usuário com novo QR Code
      {
        const qrSession = await db.query(
          'SELECT user_id FROM whatsapp_sessions WHERE unipile_account_id = $1',
          [event.account_id]
        )
        if (qrSession.rows.length > 0 && event.data?.text) {
          notifyQRUpdate(qrSession.rows[0].user_id, event.data.text)
        }
      }
      break

    default:
      console.log(`[Webhook] Evento não tratado: ${event.event}`)
  }
}

// ============================================
// Validar assinatura HMAC do Unipile
// ============================================
const validateWebhookSignature = (body: unknown, signature: string): boolean => {
  if (!process.env.UNIPILE_WEBHOOK_SECRET) return true // Dev mode

  try {
    const expected = crypto
      .createHmac('sha256', process.env.UNIPILE_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature || ''),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}

export default router
