import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import { testConnection } from './database/connection'
import { startScheduler } from './modules/scheduler/queues'

import authRoutes from './modules/auth/auth.routes'
import whatsappRoutes from './modules/whatsapp/whatsapp.routes'
import digestRoutes from './modules/digest/digest.routes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// ============================================
// Middlewares globais
// ============================================
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}))

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
}))

// Rate limiting mais apertado para auth
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Muitas tentativas de login.' },
}))

// Parse JSON (ANTES das rotas, mas DEPOIS do webhook que precisa do raw body)
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '1mb' }))

// ============================================
// Rotas
// ============================================
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/digests', digestRoutes)

// 404
app.use((_, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' })
})

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err)
  res.status(500).json({ success: false, error: 'Erro interno do servidor' })
})

// ============================================
// Inicialização
// ============================================
const start = async () => {
  await testConnection()
  startScheduler()

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║     WhatsApp Digest SaaS              ║
║     Rodando na porta ${PORT}             ║
╚═══════════════════════════════════════╝

Endpoints disponíveis:
  POST  /api/auth/register
  POST  /api/auth/login
  GET   /api/auth/me
  POST  /api/whatsapp/connect
  GET   /api/whatsapp/status
  GET   /api/whatsapp/groups
  POST  /api/whatsapp/webhook  ← Unipile envia aqui
  GET   /api/digests
  POST  /api/digests/manual
  PUT   /api/digests/schedule/config
    `)
  })
}

start().catch(console.error)

export default app
