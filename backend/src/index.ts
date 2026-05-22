import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

import metricsRouter from './routes/metrics'
import alertsRouter from './routes/alerts'
import instagramRouter from './routes/instagram'
import nuvemshopRouter from './routes/nuvemshop'
import aiRouter from './routes/ai'
import whatsappRouter from './routes/whatsapp'
import { startMetricsWorker } from './workers/metricsWorker'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
)

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL || '',
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS: ${origin} not allowed`))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  })
)

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/health',
})

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many AI requests. Please wait.' },
})

app.use(limiter)

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// ─── Logging ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms'))
}

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/metrics', metricsRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/instagram', instagramRouter)
app.use('/api/nuvemshop', nuvemshopRouter)
app.use('/api/ai', strictLimiter, aiRouter)
app.use('/api/whatsapp', whatsappRouter)

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'saint-germain-backend',
  })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Server] Unhandled error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
)

// ─── HTTP + WebSocket Server ────────────────────────────────────────────────
const server = http.createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })

const clients = new Set<WebSocket>()

wss.on('connection', (ws: WebSocket, req) => {
  clients.add(ws)
  console.log(`[WebSocket] Client connected — total: ${clients.size} (${req.socket.remoteAddress})`)

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'Saint Germain Central Operacional — WebSocket connected',
      timestamp: new Date().toISOString(),
    })
  )

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[WebSocket] Client disconnected — total: ${clients.size}`)
  })

  ws.on('error', (err) => {
    console.error('[WebSocket] Client error:', err.message)
    clients.delete(ws)
  })
})

export function broadcastToClients(event: string, data: unknown): void {
  const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() })
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// ─── Start Server ────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Saint Germain Backend running on port ${PORT}`)
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`[Server] Health check: http://localhost:${PORT}/health`)

  // Start background workers
  if (process.env.NODE_ENV !== 'test') {
    startMetricsWorker()
  }
})

export default app
