import { Queue, Worker } from 'bullmq'
import cron from 'node-cron'
import IORedis from 'ioredis'
import { db } from '../../database/connection'
import { generateDigest } from '../digest/digest.service'
import { purgeExpiredMessages } from '../messages/messages.service'
import { sendUrgentAlert } from '../digest/delivery.service'

// ============================================
// Redis — opcional (app funciona sem ele, sem filas)
// ============================================
let redisConnection: IORedis | null = null
let alertQueueInstance: Queue | null = null
let digestQueueInstance: Queue | null = null

const initRedis = () => {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL não configurada. BullMQ desabilitado — digests rodarão inline.')
    return false
  }

  try {
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })

    redisConnection.on('error', (err) => {
      console.error('[Redis] Erro de conexão:', err.message)
    })

    alertQueueInstance = new Queue('urgent-alerts', { connection: redisConnection })
    digestQueueInstance = new Queue('digest-generation', { connection: redisConnection })

    return true
  } catch (err) {
    console.warn('[Redis] Falha ao conectar:', (err as Error).message)
    return false
  }
}

// Exportar queues com fallback seguro
export const alertQueue = {
  add: async (name: string, data: any, opts?: any) => {
    if (alertQueueInstance) {
      return alertQueueInstance.add(name, data, opts)
    }
    console.log(`[AlertQueue] Redis indisponível. Alerta descartado: ${name}`)
    return null
  },
}

export const digestQueue = {
  add: async (name: string, data: any, opts?: any) => {
    if (digestQueueInstance) {
      return digestQueueInstance.add(name, data, opts)
    }
    // Fallback: executar digest inline (sem fila)
    console.log(`[DigestQueue] Redis indisponível. Executando digest inline.`)
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
      console.error('[DigestQueue] Erro no digest inline:', (err as Error).message)
    }
    return { id: 'inline-' + Date.now() }
  },
}

// ============================================
// Workers (só iniciam se Redis disponível)
// ============================================
const startWorkers = () => {
  if (!redisConnection) return

  const alertWorker = new Worker(
    'urgent-alerts',
    async (job) => {
      const { userId, chatName, senderName, preview } = job.data
      await sendUrgentAlert(userId, { chatName, senderName, preview })
    },
    { connection: redisConnection, concurrency: 5 }
  )

  alertWorker.on('failed', (job, err) => {
    console.error(`[AlertWorker] Job ${job?.id} falhou:`, err.message)
  })

  const digestWorker = new Worker(
    'digest-generation',
    async (job) => {
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
    {
      connection: redisConnection,
      concurrency: 3,
    }
  )

  digestWorker.on('completed', (job) => {
    console.log(`[DigestWorker] Job ${job.id} concluído para usuário ${job.data.userId}`)
  })

  digestWorker.on('failed', (job, err) => {
    console.error(`[DigestWorker] Job ${job?.id} falhou:`, err.message)
  })
}

// ============================================
// Cron principal — verifica schedules a cada minuto
// ============================================
export const startScheduler = () => {
  // Tentar conectar Redis (não bloqueia se falhar)
  const redisOk = initRedis()
  if (redisOk) {
    startWorkers()
  }

  // Verificar schedules a cada minuto
  cron.schedule('* * * * *', async () => {
    await processSchedules()
  })

  // Purge de mensagens antigas — toda segunda-feira às 3h
  cron.schedule('0 3 * * 1', async () => {
    const count = await purgeExpiredMessages()
    console.log(`[Cron] Purge semanal: ${count} mensagens removidas`)
  })

  // Reset de message_count_today — todo dia à meia-noite
  cron.schedule('0 0 * * *', async () => {
    await db.query('UPDATE groups SET message_count_today = 0')
    console.log('[Cron] Reset de message_count_today')
  })

  console.log(`[Scheduler] Iniciado (Redis: ${redisOk ? 'ON' : 'OFF'})`)
}

// ============================================
// Processar schedules pendentes
// ============================================
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
      if (!shouldRunNow(schedule.cron_expression, schedule.timezone)) continue

      const periodEnd = new Date()
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)

      await digestQueue.add(
        'generate-digest',
        {
          userId: schedule.user_id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          format: schedule.report_format,
          channels: schedule.delivery_channels,
          scheduleId: schedule.id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )

      await db.query(
        `UPDATE schedules SET
           last_run_at = NOW(),
           next_run_at = NOW() + INTERVAL '1 day'
         WHERE id = $1`,
        [schedule.id]
      )
    }
  } catch (err) {
    console.error('[Scheduler] Erro ao processar schedules:', err)
  }
}

const shouldRunNow = (cronExpression: string, _timezone: string): boolean => {
  return cron.validate(cronExpression)
}

// ============================================
// API para disparar digest manual
// ============================================
export const triggerManualDigest = async (
  userId: string,
  options: {
    periodHours?: number
    format?: string
    channels?: string[]
  }
): Promise<string> => {
  const periodEnd = new Date()
  const periodStart = new Date(
    periodEnd.getTime() - (options.periodHours || 24) * 60 * 60 * 1000
  )

  const scheduleResult = await db.query(
    'SELECT * FROM schedules WHERE user_id = $1 LIMIT 1',
    [userId]
  )
  const schedule = scheduleResult.rows[0]

  const result = await digestQueue.add(
    'manual-digest',
    {
      userId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      format: options.format || schedule?.report_format || 'detailed',
      channels: options.channels || schedule?.delivery_channels || ['dashboard'],
    },
    { priority: 1 }
  )

  return (result as any)?.id || 'inline-' + Date.now()
}
