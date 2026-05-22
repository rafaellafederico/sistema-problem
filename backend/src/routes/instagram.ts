import { Router, Request, Response } from 'express'
import supabaseService from '../services/supabaseService'
import openaiService from '../services/openaiService'
import evolutionApiService from '../services/evolutionApiService'

const router = Router()

const COMPLAINT_KEYWORDS = [
  'problema', 'reclamação', 'horrível', 'péssimo', 'ruim', 'demora', 'atraso',
  'não chegou', 'errado', 'quebrado', 'defeito', 'cancelar', 'reembolso',
  'devolver', 'decepcionada', 'decepcionado', 'insatisfeito', 'não funciona',
  'cadê', 'cadê meu', 'sumiu', 'roubaram', 'golpe', 'fraude',
]

function detectComplaintKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  return COMPLAINT_KEYWORDS.filter((kw) => lower.includes(kw))
}

function calculateInitialSeverity(
  matchedKeywords: string[],
  text: string
): 'critical' | 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase()
  const criticalWords = ['fraude', 'golpe', 'roubaram', 'processo', 'procon']
  if (criticalWords.some((w) => lower.includes(w))) return 'critical'
  if (matchedKeywords.length >= 4) return 'high'
  if (matchedKeywords.length >= 2) return 'medium'
  return 'low'
}

// POST /api/instagram/webhook - receive Instagram webhook events
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Instagram sends a hub.challenge for verification
    if (req.query['hub.challenge']) {
      const challenge = req.query['hub.challenge']
      return res.status(200).send(challenge)
    }

    const body = req.body

    // Handle Instagram Messaging Webhooks
    if (body.object === 'instagram' || body.object === 'page') {
      const entries = body.entry || []

      for (const entry of entries) {
        // Direct Messages
        const messaging = entry.messaging || []
        for (const msg of messaging) {
          if (msg.message?.text) {
            const text = msg.message.text
            const matchedKeywords = detectComplaintKeywords(text)

            if (matchedKeywords.length > 0) {
              const severity = calculateInitialSeverity(matchedKeywords, text)
              const source = 'instagram_dm' as const

              await supabaseService.saveComplaint({
                source,
                content: text,
                customer_identifier: msg.sender?.id,
                severity,
                keywords: matchedKeywords,
              })

              if (severity === 'critical' || severity === 'high') {
                await supabaseService.saveAlert({
                  severity,
                  module: 'Instagram',
                  title: `Reclamação ${severity === 'critical' ? 'crítica' : 'grave'} via DM`,
                  description: `${text.substring(0, 200)}`,
                  source: 'instagram',
                  metadata: { sender_id: msg.sender?.id, keywords: matchedKeywords },
                })

                await evolutionApiService.sendAlertMessage({
                  severity,
                  module: 'Instagram DM',
                  title: 'Reclamação detectada',
                  description: text.substring(0, 300),
                })
              }
            }
          }
        }

        // Comments
        const changes = entry.changes || []
        for (const change of changes) {
          if (change.field === 'comments' && change.value?.text) {
            const text = change.value.text
            const matchedKeywords = detectComplaintKeywords(text)

            if (matchedKeywords.length > 0) {
              const severity = calculateInitialSeverity(matchedKeywords, text)

              await supabaseService.saveComplaint({
                source: 'instagram_comment',
                content: text,
                customer_identifier: change.value?.from?.id,
                severity,
                keywords: matchedKeywords,
              })
            }
          }
        }
      }
    }

    res.status(200).json({ status: 'ok' })
  } catch (error) {
    console.error('[InstagramRoute] Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /api/instagram/complaints - get detected complaints
router.get('/complaints', async (req: Request, res: Response) => {
  try {
    // Query complaints with instagram sources
    const limit = parseInt(req.query.limit as string) || 20

    // Use Supabase directly for filtered query
    const supabase = (await import('../config/database')).default
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .in('source', ['instagram_dm', 'instagram_comment'])
      .order('detected_at', { ascending: false })
      .limit(limit)

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch complaints' })
    }

    res.json({ complaints: data || [], count: (data || []).length })
  } catch (error) {
    console.error('[InstagramRoute] Error fetching complaints:', error)
    res.status(500).json({ error: 'Failed to fetch complaints' })
  }
})

// POST /api/instagram/analyze - trigger AI analysis of recent messages
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }

    const texts = messages.map((m: { text: string }) => m.text || String(m))
    const analysis = await openaiService.analyzeComplaints(texts)

    // Save complaint in DB
    for (const text of texts) {
      await supabaseService.saveComplaint({
        source: 'instagram_comment',
        content: text,
        severity: analysis.severity as 'critical' | 'high' | 'medium' | 'low',
        category: analysis.category,
        keywords: detectComplaintKeywords(text),
      })
    }

    // Create alert if severity is high/critical
    if (analysis.severity === 'critical' || analysis.severity === 'high') {
      await supabaseService.saveAlert({
        severity: analysis.severity as 'critical' | 'high',
        module: 'Instagram',
        title: `Cluster de reclamações: ${analysis.category}`,
        description: `${analysis.pattern} — Recomendação: ${analysis.recommendation}`,
        source: 'instagram',
        metadata: { complaint_count: messages.length, pattern: analysis.pattern },
      })
    }

    res.json({ analysis, complaints_saved: messages.length })
  } catch (error) {
    console.error('[InstagramRoute] AI analysis error:', error)
    res.status(500).json({ error: 'Failed to analyze messages' })
  }
})

export default router
