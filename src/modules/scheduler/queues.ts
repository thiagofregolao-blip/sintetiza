import cron from 'node-cron'
import { db } from '../../database/connection'
import { generateDigest } from '../digest/digest.service'
import { purgeExpiredMessages } from '../messages/messages.service'
import { sendUrgentAlert } from '../digest/delivery.service'

// ============================================
// Redis — só inicializa se REDIS_URL estiver configurada
// ============================================
const REDIS_URL = process.env.REDIS_URL

let digestQueueInstance: any = null
let alertQueueInstance: any = null

if (REDIS_URL) {
  // Import dinâmico — só carrega bullmq/ioredis se Redis estiver configurado
  try {
    const IORedis = require('ioredis')
    const { Queue, Worker } = require('bullmq')

    const redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    })

    redisConnection.on('error', () => {
      // Silenciar após primeiro log
    })

    alertQueueInstance = new Queue('urgent-alerts', { connection: redisConnection })
    digestQueueInstance = new Queue('digest-generation', { connection: redisConnection })

    // Workers
    const alertWorker = new Worker(
      'urgent-alerts',
      async (job: any) => {
        const { userId, chatName, senderName, preview } = job.data
        await sendUrgentAlert(userId, { chatName, senderName, preview })
      },
      { connection: redisConnection, concurrency: 5 }
    )
    alertWorker.on('failed', (job: any, err: Error) => {
      console.error(`[AlertWorker] Job ${job?.id} falhou:`, err.message)
    })

    const digestWorker = new Worker(
      'digest-generation',
      async (job: any) => {
        const { userId, periodStart, periodEnd, format, channels, scheduleId } = job.data
        await generateDigest(userId, {
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          format,
          deliveryChannels: channels,
          scheduleId,
          type: 'daily',
        })
      },
      { connection: redisConnection, concurrency: 3 }
    )
    digestWorker.on('completed', (job: any) => {
      console.log(`[DigestWorker] Job ${job.id} concluído`)
    })
    digestWorker.on('failed', (job: any, err: Error) => {
      console.error(`[DigestWorker] Job ${job?.id} falhou:`, err.message)
    })

    console.log('[Redis] Conectado. BullMQ ativo.')
  } catch (err) {
    console.warn('[Redis] Falha ao inicializar BullMQ:', (err as Error).message)
  }
} else {
  console.log('[Redis] REDIS_URL não configurada. BullMQ desabilitado.')
}

// ============================================
// Queue wrappers com fallback inline
// ============================================
export const alertQueue = {
  add: async (name: string, data: any, _opts?: any) => {
    if (alertQueueInstance) {
      return alertQueueInstance.add(name, data, _opts)
    }
    console.log(`[Alert] ${data.chatName}: ${data.preview}`)
    return null
  },
}

export const digestQueue = {
  add: async (name: string, data: any, _opts?: any) => {
    if (digestQueueInstance) {
      return digestQueueInstance.add(name, data, _opts)
    }
    // Fallback: rodar inline
    console.log('[Digest] Executando inline (sem Redis)')
    try {
      await generateDigest(data.userId, {
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        format: data.format,
        deliveryChannels: data.channels,
        scheduleId: data.scheduleId,
        type: 'daily',
      })
    } catch (err) {
      console.error('[Digest] Erro inline:', (err as Error).message)
    }
    return { id: 'inline-' + Date.now() }
  },
}

// ============================================
// Cron — funciona com ou sem Redis
// ============================================
export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    await processSchedules()
  })

  cron.schedule('0 3 * * 1', async () => {
    const count = await purgeExpiredMessages()
    console.log(`[Cron] Purge: ${count} mensagens removidas`)
  })

  cron.schedule('0 0 * * *', async () => {
    await db.query('UPDATE groups SET message_count_today = 0')
  })

  console.log('[Scheduler] Iniciado')
}

const processSchedules = async () => {
  try {
    const result = await db.query(
      `SELECT s.*, u.timezone
       FROM schedules s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active = true
         AND (s.next_run_at IS NULL OR s.next_run_at <= NOW())`,
    )

    for (const schedule of result.rows) {
      if (!cron.validate(schedule.cron_expression)) continue

      const periodEnd = new Date()
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)

      await digestQueue.add('generate-digest', {
        userId: schedule.user_id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        format: schedule.report_format,
        channels: schedule.delivery_channels,
        scheduleId: schedule.id,
      })

      await db.query(
        `UPDATE schedules SET last_run_at = NOW(), next_run_at = NOW() + INTERVAL '1 day' WHERE id = $1`,
        [schedule.id]
      )
    }
  } catch (err) {
    console.error('[Scheduler] Erro:', (err as Error).message)
  }
}

export const triggerManualDigest = async (
  userId: string,
  options: { periodHours?: number; format?: string; channels?: string[] }
): Promise<string> => {
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - (options.periodHours || 24) * 60 * 60 * 1000)

  const scheduleResult = await db.query('SELECT * FROM schedules WHERE user_id = $1 LIMIT 1', [userId])
  const schedule = scheduleResult.rows[0]

  const result = await digestQueue.add('manual-digest', {
    userId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    format: options.format || schedule?.report_format || 'detailed',
    channels: options.channels || schedule?.delivery_channels || ['dashboard'],
  })

  return (result as any)?.id || 'inline-' + Date.now()
}
