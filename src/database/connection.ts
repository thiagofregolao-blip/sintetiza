import { Pool, PoolClient } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err)
})

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),

  getClient: async (): Promise<PoolClient> => {
    const client = await pool.connect()
    return client
  },

  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },
}

export const testConnection = async (retries = 5, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await db.query('SELECT NOW()')
      console.log('[DB] Conectado:', res.rows[0].now)
      return
    } catch (err) {
      console.error(`[DB] Tentativa ${attempt}/${retries} falhou:`, (err as Error).message)
      if (attempt === retries) {
        console.error('[DB] Todas as tentativas falharam. Encerrando.')
        process.exit(1)
      }
      console.log(`[DB] Aguardando ${delay / 1000}s antes da próxima tentativa...`)
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * 1.5, 15000) // backoff até 15s
    }
  }
}
