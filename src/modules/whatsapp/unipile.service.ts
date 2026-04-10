import { db } from '../../database/connection'
import { WhatsappSession, ConnectWhatsappResponse, Group } from '../../types'

const UNIPILE_BASE_URL = process.env.UNIPILE_BASE_URL!
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!

const unipileHeaders = {
  'X-API-KEY': UNIPILE_API_KEY,
  'Content-Type': 'application/json',
}

// ============================================
// Iniciar conexão — gera QR Code
// ============================================
export const initiateConnection = async (userId: string): Promise<ConnectWhatsappResponse> => {
  // Verificar se já tem sessão ativa
  const existing = await db.query(
    `SELECT * FROM whatsapp_sessions
     WHERE user_id = $1 AND status IN ('connected', 'connecting')`,
    [userId]
  )

  if (existing.rows.length > 0) {
    const session = existing.rows[0] as WhatsappSession
    if (session.status === 'connected') {
      throw new Error('WhatsApp já está conectado')
    }
    // Retorna QR existente se ainda válido
    if (session.qr_code && session.qr_expires_at && new Date(session.qr_expires_at) > new Date()) {
      return {
        session_id: session.id,
        qr_code: session.qr_code,
        qr_expires_at: session.qr_expires_at.toISOString(),
      }
    }
  }

  // Criar nova conta no Unipile (formato real da API)
  const response = await fetch(`${UNIPILE_BASE_URL}/api/v1/accounts`, {
    method: 'POST',
    headers: unipileHeaders,
    body: JSON.stringify({
      provider: 'WHATSAPP',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('[Unipile] Erro ao criar conta:', response.status, err)
    throw new Error(`Erro Unipile (${response.status}): ${err}`)
  }

  const data = await response.json() as {
    object: string
    account_id: string
    checkpoint?: { type: string; qrcode: string }
  }

  console.log('[Unipile] Resposta /accounts:', JSON.stringify(data).substring(0, 200))

  // qrcode é uma string direta, não um objeto com .data
  const qrCode = data.checkpoint?.qrcode
  if (!qrCode) {
    console.error('[Unipile] QR Code ausente na resposta:', data)
    throw new Error('QR Code não retornado pelo Unipile')
  }

  const qrExpires = new Date(Date.now() + 60 * 1000) // 60 segundos

  // Remove sessões antigas do usuário (desconectadas ou com QR expirado)
  // Mantém apenas sessões ativas (connected)
  await db.query(
    `DELETE FROM whatsapp_sessions
     WHERE user_id = $1 AND status != 'connected'`,
    [userId]
  )

  // Inserir nova sessão
  const upsertResult = await db.query(
    `INSERT INTO whatsapp_sessions
       (user_id, unipile_account_id, status, qr_code, qr_expires_at)
     VALUES ($1, $2, 'connecting', $3, $4)
     RETURNING id`,
    [userId, data.account_id, qrCode, qrExpires]
  )

  return {
    session_id: upsertResult.rows[0].id,
    qr_code: qrCode,
    qr_expires_at: qrExpires.toISOString(),
  }
}

// ============================================
// Buscar status da sessão (com fallback de polling no Unipile)
// ============================================
export const getSessionStatus = async (userId: string): Promise<WhatsappSession | null> => {
  const result = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  )
  const session = result.rows[0] as WhatsappSession | undefined
  if (!session) return null

  // Se a sessão está em 'connecting' e tem account_id do Unipile,
  // consulta o Unipile para ver se já foi conectada (fallback do webhook)
  if (session.status === 'connecting' && session.unipile_account_id) {
    try {
      const response = await fetch(
        `${UNIPILE_BASE_URL}/api/v1/accounts/${session.unipile_account_id}`,
        { headers: unipileHeaders }
      )

      if (response.ok) {
        const account = await response.json() as {
          sources?: Array<{ status?: string }>
          connection_params?: { im?: { phone_number?: string; name?: string } }
        }

        // Se algum source está OK, considera conectado
        const isConnected = account.sources?.some(s => s.status === 'OK')
        if (isConnected) {
          const phone = account.connection_params?.im?.phone_number
          const name = account.connection_params?.im?.name
          await handleAccountConnected(session.unipile_account_id, phone, name)
          // Re-busca a sessão atualizada
          const updated = await db.query(
            'SELECT * FROM whatsapp_sessions WHERE id = $1',
            [session.id]
          )
          return updated.rows[0] || session
        }
      }
    } catch (err) {
      console.error('[Unipile] Erro ao verificar status:', (err as Error).message)
    }
  }

  return session
}

// ============================================
// Callback do Unipile quando QR é escaneado
// (chamado pelo webhook do Unipile)
// ============================================
export const handleAccountConnected = async (
  unipileAccountId: string,
  phoneNumber?: string,
  displayName?: string
): Promise<void> => {
  await db.query(
    `UPDATE whatsapp_sessions SET
       status = 'connected',
       phone_number_encrypted = $2,
       display_name = $3,
       connected_at = NOW(),
       qr_code = NULL,
       qr_expires_at = NULL,
       error_message = NULL,
       updated_at = NOW()
     WHERE unipile_account_id = $1`,
    [unipileAccountId, phoneNumber || null, displayName || null]
  )

  // Sincronizar grupos após conexão — com retry automático porque o
  // Unipile demora para indexar os chats após o scan do QR Code
  const session = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE unipile_account_id = $1',
    [unipileAccountId]
  )

  if (session.rows.length > 0) {
    const userId = session.rows[0].user_id
    // Não aguarda — roda em background com retries
    syncGroupsWithRetry(userId, unipileAccountId).catch((err) => {
      console.error('[Unipile] Erro no syncGroupsWithRetry:', (err as Error).message)
    })
  }
}

// ============================================
// Sync com retries automáticos para aguardar Unipile indexar
// ============================================
const syncGroupsWithRetry = async (
  userId: string,
  unipileAccountId: string
): Promise<void> => {
  const delays = [0, 5000, 15000, 30000, 60000] // tentativas: imediato, 5s, 15s, 30s, 60s

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }

    try {
      await syncGroups(userId, unipileAccountId)

      // Verifica se achou algo
      const count = await db.query(
        'SELECT COUNT(*) FROM groups WHERE user_id = $1',
        [userId]
      )
      const groupsFound = parseInt(count.rows[0].count, 10)

      if (groupsFound > 0) {
        console.log(`[Unipile] syncGroupsWithRetry: ${groupsFound} grupos na tentativa ${attempt + 1}`)
        return
      }

      console.log(`[Unipile] Tentativa ${attempt + 1}/${delays.length}: 0 grupos ainda (Unipile indexando...)`)
    } catch (err) {
      console.error(`[Unipile] Tentativa ${attempt + 1} falhou:`, (err as Error).message)
    }
  }

  console.warn(`[Unipile] Após ${delays.length} tentativas, nenhum grupo foi encontrado para ${userId}`)
}

// ============================================
// Sincronizar grupos do WhatsApp
// ============================================
export const syncGroups = async (userId: string, unipileAccountId: string): Promise<void> => {
  try {
    // Busca todas as páginas de chats (Unipile limita a 250 por página)
    const allChats: Array<{
      id: string
      provider_id?: string
      name?: string | null
      type?: number
      timestamp?: string
    }> = []
    let cursor: string | null = null
    let pageCount = 0
    const maxPages = 5 // até 1250 chats

    do {
      const url = new URL(`${UNIPILE_BASE_URL}/api/v1/chats`)
      url.searchParams.set('account_id', unipileAccountId)
      url.searchParams.set('limit', '250')
      if (cursor) url.searchParams.set('cursor', cursor)

      const response = await fetch(url.toString(), { headers: unipileHeaders })
      if (!response.ok) {
        console.error('[Unipile] Erro ao buscar chats:', response.status)
        break
      }

      const data = await response.json() as {
        items: typeof allChats
        cursor: string | null
      }

      allChats.push(...(data.items || []))
      cursor = data.cursor
      pageCount++
    } while (cursor && pageCount < maxPages)

    console.log(`[Unipile] Total de chats: ${allChats.length}`)

    const session = await db.query(
      'SELECT id FROM whatsapp_sessions WHERE user_id = $1 AND unipile_account_id = $2',
      [userId, unipileAccountId]
    )

    if (session.rows.length === 0) return
    const sessionId = session.rows[0].id

    // Limpa grupos antigos com IDs Unipile instaveis (qualquer coisa sem @g.us)
    // Isso migra dados de syncs antigos para o novo esquema com provider_id estavel
    const deleted = await db.query(
      `DELETE FROM groups
       WHERE user_id = $1
         AND whatsapp_chat_id NOT LIKE '%@g.us'`,
      [userId]
    )
    if (deleted.rowCount && deleted.rowCount > 0) {
      console.log(`[Unipile] Removidos ${deleted.rowCount} grupos com IDs antigos instaveis`)
    }

    // Filtra apenas grupos (type === 1 ou provider_id terminando em @g.us)
    const groups = allChats.filter(
      c => c.type === 1 || c.provider_id?.endsWith('@g.us')
    )
    console.log(`[Unipile] Grupos encontrados: ${groups.length}`)

    // IMPORTANTE: usamos provider_id como whatsapp_chat_id (chave estavel: 120363...@g.us)
    // porque o chat.id do Unipile muda entre sincronizacoes e webhooks.
    // Isso garante que mensagens do webhook (que tem provider_chat_id) batem com o grupo.
    for (const chat of groups) {
      const stableId = chat.provider_id || chat.id // fallback se provider_id faltar
      await db.query(
        `INSERT INTO groups
           (user_id, session_id, whatsapp_chat_id, name, participant_count, last_message_at, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
           name = $4,
           last_message_at = $6,
           synced_at = NOW(),
           updated_at = NOW()`,
        [
          userId,
          sessionId,
          stableId,
          chat.name || 'Grupo sem nome',
          0,
          chat.timestamp ? new Date(chat.timestamp) : null,
        ]
      )
    }

    console.log(`[Unipile] Sincronizados ${groups.length} grupos para usuário ${userId}`)
  } catch (err) {
    console.error('[Unipile] Erro ao sincronizar grupos:', err)
  }
}

// ============================================
// Listar grupos do usuário
// ============================================
export const listGroups = async (userId: string): Promise<Group[]> => {
  const result = await db.query(
    `SELECT * FROM groups
     WHERE user_id = $1
     ORDER BY last_message_at DESC NULLS LAST`,
    [userId]
  )
  return result.rows
}

// ============================================
// Configurar monitoramento de grupo
// ============================================
export const updateGroupConfig = async (
  userId: string,
  groupId: string,
  config: { is_monitored?: boolean; is_excluded?: boolean }
): Promise<void> => {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (config.is_monitored !== undefined) {
    fields.push(`is_monitored = $${i++}`)
    values.push(config.is_monitored)
  }
  if (config.is_excluded !== undefined) {
    fields.push(`is_excluded = $${i++}`)
    values.push(config.is_excluded)
    if (config.is_excluded) {
      fields.push(`is_monitored = false`)
    }
  }

  if (fields.length === 0) return

  values.push(userId, groupId)
  await db.query(
    `UPDATE groups SET ${fields.join(', ')} WHERE user_id = $${i} AND id = $${i + 1}`,
    values
  )
}

// ============================================
// Desconectar WhatsApp
// ============================================
export const disconnect = async (userId: string): Promise<void> => {
  const session = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE user_id = $1 AND status = $2',
    [userId, 'connected']
  )

  if (session.rows.length === 0) {
    throw new Error('Nenhuma sessão ativa encontrada')
  }

  const { unipile_account_id } = session.rows[0]

  // Desconectar no Unipile
  try {
    await fetch(`${UNIPILE_BASE_URL}/api/v1/accounts/${unipile_account_id}`, {
      method: 'DELETE',
      headers: unipileHeaders,
    })
  } catch (err) {
    console.error('[Unipile] Erro ao desconectar:', err)
  }

  await db.query(
    `UPDATE whatsapp_sessions SET
       status = 'disconnected',
       disconnected_at = NOW(),
       updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  )
}
