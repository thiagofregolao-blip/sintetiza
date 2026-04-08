// ============================================
// delivery.service.ts — entrega de relatórios
// ============================================
import nodemailer from 'nodemailer'
import { db } from '../../database/connection'
import { DeliveryChannel } from '../../types'

const UNIPILE_BASE_URL = process.env.UNIPILE_BASE_URL!
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!

// Configurar SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// ============================================
// Entregar digest por todos os canais configurados
// ============================================
export const deliverDigest = async (
  userId: string,
  digestId: string,
  contentText: string,
  contentHtml: string | null,
  channels: DeliveryChannel[]
): Promise<void> => {
  const userResult = await db.query(
    'SELECT email, name FROM users WHERE id = $1',
    [userId]
  )
  const user = userResult.rows[0]

  const sessionResult = await db.query(
    `SELECT unipile_account_id FROM whatsapp_sessions
     WHERE user_id = $1 AND status = 'connected'
     ORDER BY connected_at DESC LIMIT 1`,
    [userId]
  )
  const session = sessionResult.rows[0]

  const errors: string[] = []

  for (const channel of channels) {
    try {
      if (channel === 'whatsapp' && session?.unipile_account_id) {
        await sendViaWhatsApp(session.unipile_account_id, contentText)
      } else if (channel === 'email') {
        await sendViaEmail(user.email, user.name, contentText, contentHtml)
      }
      // dashboard: já salvo no banco, disponível via GET /digests
    } catch (err: any) {
      errors.push(`${channel}: ${err.message}`)
      console.error(`[Delivery] Erro no canal ${channel}:`, err)
    }
  }

  if (errors.length > 0) {
    await db.query(
      'UPDATE digests SET delivery_error = $2 WHERE id = $1',
      [digestId, errors.join('; ')]
    )
  }
}

// ============================================
// Enviar via WhatsApp (Unipile)
// ============================================
const sendViaWhatsApp = async (
  unipileAccountId: string,
  message: string
): Promise<void> => {
  // Buscar o próprio número do usuário para enviar pra si mesmo
  const response = await fetch(`${UNIPILE_BASE_URL}/api/v1/messages`, {
    method: 'POST',
    headers: {
      'X-API-KEY': UNIPILE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_id: unipileAccountId,
      // chat_id do próprio usuário = enviar mensagem pra si mesmo
      to: 'me',
      text: message,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Unipile WhatsApp: ${err}`)
  }
}

// ============================================
// Enviar via Email
// ============================================
const sendViaEmail = async (
  email: string,
  name: string,
  textContent: string,
  htmlContent: string | null
): Promise<void> => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `📊 Seu resumo WhatsApp`,
    text: textContent,
    html: htmlContent || textContent.replace(/\n/g, '<br>'),
  })
}

// ============================================
// Enviar alerta urgente (score 5)
// ============================================
export const sendUrgentAlert = async (
  userId: string,
  data: {
    chatName?: string
    senderName?: string
    preview: string
  }
): Promise<void> => {
  const sessionResult = await db.query(
    `SELECT unipile_account_id FROM whatsapp_sessions
     WHERE user_id = $1 AND status = 'connected'`,
    [userId]
  )

  if (sessionResult.rows.length === 0) return

  const message =
    `🚨 *Mensagem urgente!*\n\n` +
    `De: ${data.senderName || 'Desconhecido'}\n` +
    `${data.chatName ? `Grupo: ${data.chatName}\n` : ''}` +
    `\n"${data.preview}..."`

  await sendViaWhatsApp(sessionResult.rows[0].unipile_account_id, message)
}
