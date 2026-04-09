import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'

import { testConnection } from './database/connection'
import { runMigrations } from './database/migrate'
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

// Railway roda atrás de proxy — necessário para rate-limit e IP correto
app.set('trust proxy', 1)

// Helmet com CSP relaxada para permitir Next.js (inline scripts, Google Fonts)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}))
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}))

// Rate limiting — só para /api/* (não aplica em arquivos estáticos do frontend)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // 500 req / 15min por IP (suficiente pro polling + uso normal)
  message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  validate: { xForwardedForHeader: false },
  // Não contar /status no rate limit (usado pelo polling do QR)
  skip: (req) => req.path === '/whatsapp/status' || req.path === '/whatsapp/qr-stream',
}))

// Rate limiting mais apertado para login (brute force protection)
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Muitas tentativas de login.' },
  validate: { xForwardedForHeader: false },
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

// ============================================
// Frontend — servir Next.js static export
// ============================================
const frontendPath = path.join(__dirname, '..', 'frontend', 'out')
app.use(express.static(frontendPath))

// SPA fallback: qualquer rota que não seja /api/* serve o index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return res.status(404).json({ success: false, error: 'Rota não encontrada' })
  }
  const indexPath = path.join(frontendPath, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ success: false, error: 'Frontend não encontrado' })
    }
  })
})

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err)
  res.status(500).json({ success: false, error: 'Erro interno do servidor' })
})

// ============================================
// Inicialização — HTTP primeiro, DB/scheduler em background
// Railway precisa que a porta responda rápido
// ============================================
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[Server] Rodando na porta ${PORT}`)

  // Conectar DB e iniciar scheduler em background (não bloqueia HTTP)
  testConnection()
    .then(() => runMigrations())
    .then(() => {
      startScheduler()
      console.log('[Server] DB conectado, migrations OK, scheduler iniciado')
    })
    .catch((err) => {
      console.error('[Server] Falha ao conectar DB:', err)
    })
})

export default app
