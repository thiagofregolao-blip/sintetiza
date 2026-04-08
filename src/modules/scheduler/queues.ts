import cron from 'node-cron'
import { db } from '../../database/connection'
import { generateDigest } from '../digest/digest.service'
import { purgeExpiredMessages } from '../messages/messages.service'
import { sendUrgentAlert } from '../digest/delivery.service'

// ============================================
// Sem Redis/BullMQ — execução direta via cron
// ============================================

export const alertQueue = {
  add: async (_name: string, data: any, _opts?: any) => {
    try {
      await sendUrgentAlert(data.userId, {
        chatName: data.chatName,
        senderName: data.senderName,
        preview: data.preview,
      })
    } catch (err) {
      console.error('[Alert] Erro:', (err as Error).message)
    }
    return null
  },
}

export const digestQueue = {
  add: async (_name: string, data: any, _opts?: any) => {
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
      console.error('[Digest] Erro:', (err as Error).message)
    }
    return { id: 'direct-' + Date.now() }
  },
}

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

  console.log('[Scheduler] Iniciado (modo direto, sem Redis)')
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

  return (result as any)?.id || 'direct-' + Date.now()
}
