import { db } from '../../database/connection'
import { Message, UnipileWebhookEvent } from '../../types'
import { alertQueue } from '../scheduler/queues'

// ============================================
// Normaliza o payload do Unipile em campos conhecidos.
// Formato real do Unipile (descoberto via logs):
//   event, account_id, chat_id, provider_chat_id,
//   sender: { attendee_id, attendee_name, attendee_specifics: { phone_number }, attendee_public_identifier },
//   subject (nome do grupo), message (conteudo),
//   message_id, timestamp (ISO string), is_sender, attachments[]
// ============================================
interface NormalizedMessage {
  unipile_message_id: string | null
  chat_id: string // ID interno do Unipile (bate com groups.whatsapp_chat_id)
  provider_chat_id: string // ID original do WhatsApp (120363...@g.us)
  chat_name: string | null
  is_group: boolean
  sender_name: string | null
  sender_phone: string | null
  sender_wa_id: string | null
  content: string
  is_sender: boolean // true = mensagem enviada pelo proprio usuario
  has_media: boolean
  media_url: string | null
  sent_at: Date
}

const normalizeUnipileMessage = (raw: any): NormalizedMessage | null => {
  // Aceita event.data como envelope OU o raw direto
  const src = raw?.data || raw

  // Timestamp: Unipile manda ISO string, mas pode vir como unix se mudar
  let sentAt: Date
  const ts = src.timestamp || src.sent_at || src.created_at
  if (!ts) {
    sentAt = new Date() // fallback
  } else if (typeof ts === 'string') {
    sentAt = new Date(ts)
  } else if (typeof ts === 'number') {
    // Se for number, detecta se esta em ms ou segundos
    sentAt = new Date(ts > 1e12 ? ts : ts * 1000)
  } else {
    sentAt = new Date()
  }
  if (isNaN(sentAt.getTime())) {
    sentAt = new Date()
  }

  // Chat ID interno (o que o sync gravou em groups.whatsapp_chat_id)
  const chatId = src.chat_id || src.chatId || ''
  const providerChatId = src.provider_chat_id || src.provider_id || ''

  // Grupo? Olha o provider_chat_id (o formato original do WhatsApp)
  const isGroup =
    providerChatId.includes('@g.us') ||
    (Array.isArray(src.attendees) && src.attendees.length > 1) ||
    !!src.subject

  // Conteudo da mensagem
  const content =
    src.message ||
    src.text ||
    src.body ||
    src.content ||
    ''

  // Sender
  const sender = src.sender || {}
  const senderName =
    sender.attendee_name ||
    sender.display_name ||
    sender.name ||
    null
  const senderPhone =
    sender.attendee_specifics?.phone_number ||
    sender.phone_number ||
    null
  const senderWaId =
    sender.attendee_public_identifier ||
    sender.attendee_provider_id ||
    sender.id ||
    null

  // Chat name — subject e o nome do grupo no Unipile
  const chatName = src.subject || src.chat_name || src.name || null

  // is_sender: true = mensagem foi enviada pelo proprio usuario (nao deve salvar)
  const isSender =
    src.is_sender === true ||
    src.from_me === true ||
    sender.is_self === true

  // Media
  const attachments = Array.isArray(src.attachments) ? src.attachments : []
  const hasMedia = attachments.length > 0 || src.has_media === true
  const mediaUrl = attachments[0]?.url || src.media_url || null

  // ID unico da mensagem
  const messageId = src.message_id || src.id || null

  return {
    unipile_message_id: messageId,
    chat_id: chatId,
    provider_chat_id: providerChatId,
    chat_name: chatName,
    is_group: isGroup,
    sender_name: senderName,
    sender_phone: senderPhone,
    sender_wa_id: senderWaId,
    content,
    is_sender: isSender,
    has_media: hasMedia,
    media_url: mediaUrl,
    sent_at: sentAt,
  }
}

// ============================================
// saveMessage — persiste mensagem do webhook
// ============================================
export const saveMessage = async (
  userId: string,
  sessionId: string,
  event: UnipileWebhookEvent | any
): Promise<Message | null> => {
  const msg = normalizeUnipileMessage(event)
  if (!msg) {
    console.warn('[saveMessage] Payload invalido, ignorando')
    return null
  }

  // Ignorar mensagens enviadas pelo proprio usuario
  if (msg.is_sender) {
    return null
  }

  // Dedup
  if (msg.unipile_message_id) {
    const exists = await db.query(
      'SELECT id FROM messages WHERE unipile_message_id = $1',
      [msg.unipile_message_id]
    )
    if (exists.rows.length > 0) return null
  }

  const chatType: 'group' | 'individual' = msg.is_group ? 'group' : 'individual'

  // Se for grupo, verifica se esta sendo monitorado
  let groupId: string | null = null
  if (chatType === 'group') {
    const group = await db.query(
      `SELECT id, is_monitored, is_excluded FROM groups
       WHERE user_id = $1 AND whatsapp_chat_id = $2`,
      [userId, msg.chat_id]
    )

    if (group.rows.length === 0) {
      console.log(`[saveMessage] Grupo ${msg.chat_id} (${msg.chat_name}) nao sincronizado, ignorando`)
      return null
    }

    const { id, is_monitored, is_excluded } = group.rows[0]
    if (!is_monitored || is_excluded) {
      return null
    }
    groupId = id
  }

  // Buscar keywords do usuario
  const keywordsResult = await db.query(
    'SELECT word, type, case_sensitive FROM keywords WHERE user_id = $1 AND is_active = true',
    [userId]
  )
  const keywords = keywordsResult.rows as Array<{
    word: string
    type: string
    case_sensitive: boolean
  }>

  // Detectar keywords
  const matchedKeywords: string[] = []
  let keywordUrgent = false
  let keywordIgnore = false

  for (const kw of keywords) {
    const text = kw.case_sensitive ? msg.content : msg.content.toLowerCase()
    const word = kw.case_sensitive ? kw.word : kw.word.toLowerCase()

    if (text.includes(word)) {
      matchedKeywords.push(kw.word)
      if (kw.type === 'urgent') keywordUrgent = true
      if (kw.type === 'ignore') keywordIgnore = true

      await db.query(
        'UPDATE keywords SET match_count = match_count + 1 WHERE user_id = $1 AND word = $2',
        [userId, kw.word]
      )
    }
  }

  if (keywordIgnore) return null

  // Mencao: por enquanto, false. TODO: detectar via attendees/mentions
  const isMention = false

  // Urgencia
  const urgencyScore = calculateUrgency({
    isMention,
    keywordUrgent,
    chatType,
    contentLength: msg.content.length,
    hasMedia: msg.has_media,
  })

  // Expiracao por plano
  const userResult = await db.query('SELECT plan FROM users WHERE id = $1', [userId])
  const plan = userResult.rows[0]?.plan || 'free'
  const retentionDays = getRetentionDays(plan)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + retentionDays)

  // Insert
  const result = await db.query(
    `INSERT INTO messages (
       user_id, session_id, group_id, chat_id, chat_type, chat_name,
       sender_wa_id, sender_name, content, media_type, has_media, media_url,
       is_mention, is_reply, urgency_score, keyword_matched,
       sent_at, expires_at, unipile_message_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      userId,
      sessionId,
      groupId,
      msg.chat_id,
      chatType,
      msg.chat_name,
      msg.sender_wa_id,
      msg.sender_name,
      msg.content || null,
      msg.has_media ? 'image' : 'text',
      msg.has_media,
      msg.media_url,
      isMention,
      false,
      urgencyScore,
      matchedKeywords.length > 0 ? matchedKeywords : null,
      msg.sent_at,
      expiresAt,
      msg.unipile_message_id,
    ]
  )

  const message: Message = result.rows[0]
  console.log(`[saveMessage] OK: ${msg.sender_name} em ${msg.chat_name}: ${msg.content.substring(0, 50)}`)

  // Urgencia 5 = alerta imediato
  if (urgencyScore >= 5) {
    await alertQueue.add('urgent-alert', {
      userId,
      messageId: message.id,
      chatName: msg.chat_name,
      senderName: msg.sender_name,
      preview: msg.content.substring(0, 100),
    })
  }

  // Atualizar last_message_at e contador do grupo
  if (groupId) {
    await db.query(
      `UPDATE groups SET
         last_message_at = $2,
         message_count_today = message_count_today + 1,
         updated_at = NOW()
       WHERE id = $1`,
      [groupId, msg.sent_at]
    )
  }

  return message
}

// ============================================
// listMessages — para a página de Mensagens do frontend
// ============================================
export const listMessages = async (
  userId: string,
  options: {
    groupId?: string
    limit?: number
    offset?: number
    minUrgency?: number
    onlyMentions?: boolean
  } = {}
): Promise<Message[]> => {
  const params: unknown[] = [userId]
  let query = `
    SELECT m.*, g.name AS group_name
    FROM messages m
    LEFT JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = $1
  `
  let i = 2

  if (options.groupId) {
    query += ` AND m.group_id = $${i++}`
    params.push(options.groupId)
  }
  if (options.minUrgency) {
    query += ` AND m.urgency_score >= $${i++}`
    params.push(options.minUrgency)
  }
  if (options.onlyMentions) {
    query += ` AND m.is_mention = true`
  }

  query += ` ORDER BY m.sent_at DESC LIMIT $${i++} OFFSET $${i++}`
  params.push(options.limit || 50)
  params.push(options.offset || 0)

  const result = await db.query(query, params)
  return result.rows
}

// ============================================
// getMessagesByPeriod — para geração do digest
// ============================================
export const getMessagesByPeriod = async (
  userId: string,
  start: Date,
  end: Date,
  chatId?: string
): Promise<Message[]> => {
  const params: unknown[] = [userId, start, end]
  let query = `
    SELECT * FROM messages
    WHERE user_id = $1
      AND sent_at BETWEEN $2 AND $3
      AND included_in_digest = false
  `

  if (chatId) {
    query += ` AND chat_id = $4`
    params.push(chatId)
  }

  query += ` ORDER BY sent_at ASC`

  const result = await db.query(query, params)
  return result.rows
}

// ============================================
// getDigestContext — agrega dados para o Claude
// ============================================
export interface DigestContext {
  userId: string
  periodStart: Date
  periodEnd: Date
  groups: Array<{
    chat_id: string
    chat_name: string
    message_count: number
    messages: Array<{
      sender: string
      content: string
      sent_at: Date
      is_mention: boolean
      urgency_score: number
    }>
  }>
  individuals: Array<{
    chat_id: string
    contact_name: string
    message_count: number
    messages: Array<{
      sender: string
      content: string
      sent_at: Date
      urgency_score: number
    }>
  }>
  stats: {
    total_messages: number
    total_mentions: number
    total_urgent: number
    total_media: number
  }
}

export const getDigestContext = async (
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<DigestContext> => {
  const messages = await getMessagesByPeriod(userId, periodStart, periodEnd)

  const groupMap = new Map<string, DigestContext['groups'][0]>()
  const individualMap = new Map<string, DigestContext['individuals'][0]>()

  let totalMentions = 0
  let totalUrgent = 0
  let totalMedia = 0

  for (const msg of messages) {
    if (!msg.content) continue

    const msgData = {
      sender: msg.sender_name || msg.sender_wa_id || 'Desconhecido',
      content: msg.content,
      sent_at: msg.sent_at,
      is_mention: msg.is_mention,
      urgency_score: msg.urgency_score,
    }

    if (msg.is_mention) totalMentions++
    if (msg.urgency_score >= 4) totalUrgent++
    if (msg.has_media) totalMedia++

    if (msg.chat_type === 'group') {
      if (!groupMap.has(msg.chat_id)) {
        groupMap.set(msg.chat_id, {
          chat_id: msg.chat_id,
          chat_name: msg.chat_name || 'Grupo',
          message_count: 0,
          messages: [],
        })
      }
      const group = groupMap.get(msg.chat_id)!
      group.message_count++
      // Limite de 100 mensagens por grupo para não estourar contexto do Claude
      if (group.messages.length < 100) {
        group.messages.push(msgData)
      }
    } else {
      if (!individualMap.has(msg.chat_id)) {
        individualMap.set(msg.chat_id, {
          chat_id: msg.chat_id,
          contact_name: msg.chat_name || msg.sender_name || 'Contato',
          message_count: 0,
          messages: [],
        })
      }
      const individual = individualMap.get(msg.chat_id)!
      individual.message_count++
      if (individual.messages.length < 50) {
        individual.messages.push(msgData)
      }
    }
  }

  return {
    userId,
    periodStart,
    periodEnd,
    groups: Array.from(groupMap.values()).sort((a, b) => b.message_count - a.message_count),
    individuals: Array.from(individualMap.values()).sort((a, b) => b.message_count - a.message_count),
    stats: {
      total_messages: messages.length,
      total_mentions: totalMentions,
      total_urgent: totalUrgent,
      total_media: totalMedia,
    },
  }
}

// ============================================
// Marcar mensagens como incluídas no digest
// ============================================
export const markMessagesAsDigested = async (
  userId: string,
  digestId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void> => {
  await db.query(
    `UPDATE messages SET
       included_in_digest = true,
       digest_id = $3
     WHERE user_id = $1
       AND sent_at BETWEEN $4 AND $5
       AND included_in_digest = false`,
    [userId, digestId, digestId, periodStart, periodEnd]
  )
}

// ============================================
// Purge de mensagens antigas (LGPD)
// Executar via cron semanal
// ============================================
export const purgeExpiredMessages = async (): Promise<number> => {
  const result = await db.query(
    'DELETE FROM messages WHERE expires_at < NOW() RETURNING id'
  )
  const count = result.rows.length
  if (count > 0) {
    console.log(`[Purge] ${count} mensagens expiradas removidas`)
  }
  return count
}

// ============================================
// Helpers
// ============================================

const calculateUrgency = (params: {
  isMention: boolean
  keywordUrgent: boolean
  chatType: string
  contentLength: number
  hasMedia: boolean
}): number => {
  let score = 1

  // Menção direta ao usuário = +3
  if (params.isMention) score += 3

  // Keyword urgente = +2
  if (params.keywordUrgent) score += 2

  // Conversa individual = +1 base (já é mais pessoal)
  if (params.chatType === 'individual') score += 1

  // Mensagem longa = +0.5 (arredonda para cima)
  if (params.contentLength > 200) score += 1

  return Math.min(score, 5)
}

const getRetentionDays = (plan: string): number => {
  const map: Record<string, number> = {
    free: parseInt(process.env.RETENTION_FREE || '30'),
    pro: parseInt(process.env.RETENTION_PRO || '90'),
    business: parseInt(process.env.RETENTION_BUSINESS || '365'),
  }
  return map[plan] || 30
}
