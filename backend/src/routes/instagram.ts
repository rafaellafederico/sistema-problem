import { Router, Request, Response } from 'express'
import supabaseService from '../services/supabaseService'
import openaiService from '../services/openaiService'
import emailService from '../services/emailService'
import instagramService from '../services/instagramService'

const router = Router()

// ─── Keyword lists ────────────────────────────────────────────────────────────

const COMPLAINT_KEYWORDS = [
  // pagamento
  'pix não aprova', 'pix não caiu', 'pagamento não aprovado', 'não consegui pagar',
  'erro no pagamento', 'pagamento recusado', 'cartão recusado', 'boleto não gerou',
  // checkout
  'checkout travando', 'site travou', 'não consigo finalizar', 'não finaliza',
  'tá travado', 'bugando', 'deu erro', 'erro na compra', 'não carrega',
  // promoção / cupom
  'cupom não funciona', 'cupom não aplica', 'desconto não aplica', 'promoção não funciona',
  'promoção não aplica', 'código não funciona', 'código inválido',
  // site
  'site caiu', 'site fora', 'site não abre', 'página não carrega', 'site lento',
  // entrega / pedido
  'não chegou', 'cadê meu pedido', 'pedido sumiu', 'rastreio não atualiza',
  'atraso', 'produto errado', 'produto com defeito',
  // crítico
  'fraude', 'golpe', 'roubaram', 'procon', 'reclame aqui', 'processo', 'advogado',
  // sentimento
  'horrível', 'péssimo', 'absurdo', 'vergonha', 'decepcionada', 'decepcionado',
  'nunca mais compro', 'cancelar pedido', 'reembolso', 'devolver',
]

const CRITICAL_KEYWORDS = [
  'fraude', 'golpe', 'roubaram', 'procon', 'processo', 'advogado', 'reclame aqui',
]

const INSTABILITY_KEYWORDS = [
  'site caiu', 'site fora', 'checkout travando', 'não consigo finalizar',
  'pix não aprova', 'cupom não funciona', 'promoção não aplica',
  'pagamento não aprovado', 'não carrega', 'tá travado', 'bugando',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  return COMPLAINT_KEYWORDS.filter((kw) => lower.includes(kw))
}

function classifySeverity(
  keywords: string[],
  text: string
): 'critical' | 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase()
  if (CRITICAL_KEYWORDS.some((w) => lower.includes(w))) return 'critical'
  if (keywords.length >= 3) return 'high'
  if (keywords.length >= 1) return 'medium'
  return 'low'
}

function isInstabilityComplaint(text: string): boolean {
  const lower = text.toLowerCase()
  return INSTABILITY_KEYWORDS.some((kw) => lower.includes(kw))
}

async function processComment(
  text: string,
  source: 'instagram_comment' | 'instagram_dm',
  authorId?: string
): Promise<void> {
  const keywords = detectKeywords(text)
  if (keywords.length === 0) return

  const severity = classifySeverity(keywords, text)

  await supabaseService.saveComplaint({
    source,
    content: text,
    customer_identifier: authorId,
    severity,
    keywords,
    category: isInstabilityComplaint(text) ? 'instabilidade' : 'reclamacao',
  })

  if (severity === 'critical' || severity === 'high') {
    await supabaseService.saveAlert({
      severity,
      module: 'Instagram',
      title: `Reclamação ${severity === 'critical' ? 'crítica' : 'grave'} detectada`,
      description: text.substring(0, 300),
      source: 'instagram',
      metadata: { author_id: authorId, keywords, source_type: source },
    })

    await emailService.sendAlertEmail({
      severity,
      module: 'Instagram',
      title: `Reclamação ${severity === 'critical' ? 'Crítica' : 'Grave'} — ${source === 'instagram_dm' ? 'DM' : 'Comentário'}`,
      description: text,
      metadata: { keywords, author_id: authorId },
    })
  }

  // Check for instability spike after saving
  await checkInstabilitySpike()
}

async function checkInstabilitySpike(): Promise<void> {
  try {
    const supabase = (await import('../config/database')).default
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('complaints')
      .select('id, keywords, content')
      .in('source', ['instagram_comment', 'instagram_dm'])
      .gte('detected_at', since)

    if (!data || data.length < 5) return

    // Count instability-related
    const instabilityComplaints = data.filter((c) =>
      isInstabilityComplaint(c.content)
    )

    if (instabilityComplaints.length >= 5) {
      // Check if we already alerted in last 30 min to avoid spam
      const recentAlerts = await supabaseService.getAlerts({
        status: 'open',
        limit: 10,
      })

      const alreadyAlerted = recentAlerts.some(
        (a) =>
          a.module === 'Instagram' &&
          a.title.includes('Spike') &&
          new Date(a.created_at).getTime() > Date.now() - 30 * 60 * 1000
      )

      if (!alreadyAlerted) {
        const alert = await supabaseService.saveAlert({
          severity: 'critical',
          module: 'Instagram',
          title: `Spike de instabilidade — ${instabilityComplaints.length} reclamações em 15 min`,
          description: `${instabilityComplaints.length} clientes relataram problemas operacionais nos últimos 15 minutos. Possível instabilidade no checkout, pagamento ou site.`,
          source: 'instagram',
          metadata: {
            complaint_count: instabilityComplaints.length,
            total_complaints: data.length,
            window_minutes: 15,
          },
        })

        await emailService.sendAlertEmail({
          severity: 'critical',
          module: 'Instagram',
          title: `Spike de Instabilidade Detectado`,
          description: `${instabilityComplaints.length} clientes reportaram problemas nos últimos 15 minutos. Verifique checkout, pagamento e disponibilidade do site imediatamente.`,
          metadata: {
            reclamacoes_instabilidade: instabilityComplaints.length,
            total_reclamacoes: data.length,
            janela: '15 minutos',
          },
        })

        console.log(
          `[Instagram] SPIKE ALERT: ${instabilityComplaints.length} instability complaints in 15 min`
        )
      }
    }
  } catch (error) {
    console.error('[Instagram] Spike check error:', error)
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/instagram/webhook — Meta webhook verification (obrigatório)
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'saint-germain-verify'

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Instagram] Webhook verified by Meta')
    return res.status(200).send(challenge)
  }

  console.warn('[Instagram] Webhook verification failed')
  return res.status(403).json({ error: 'Verification failed' })
})

// POST /api/instagram/webhook — receber eventos do Instagram
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body

    if (body.object !== 'instagram' && body.object !== 'page') {
      return res.status(200).json({ status: 'ignored' })
    }

    const entries = body.entry || []

    for (const entry of entries) {
      // Comentários em posts
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === 'comments' && change.value?.text) {
          await processComment(
            change.value.text,
            'instagram_comment',
            change.value?.from?.id
          )
        }

        // Menções
        if (change.field === 'mentions' && change.value?.media_id) {
          console.log('[Instagram] Mention detected — media_id:', change.value.media_id)
        }
      }

      // Direct Messages
      const messaging = entry.messaging || []
      for (const msg of messaging) {
        if (msg.message?.text) {
          await processComment(msg.message.text, 'instagram_dm', msg.sender?.id)
        }
      }
    }

    res.status(200).json({ status: 'ok' })
  } catch (error) {
    console.error('[Instagram] Webhook error:', error)
    res.status(500).json({ error: 'Processing failed' })
  }
})

// GET /api/instagram/complaints — listar reclamações detectadas
router.get('/complaints', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const supabase = (await import('../config/database')).default

    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .in('source', ['instagram_comment', 'instagram_dm'])
      .order('detected_at', { ascending: false })
      .limit(limit)

    if (error) return res.status(500).json({ error: 'Failed to fetch complaints' })

    res.json({ complaints: data || [], count: (data || []).length })
  } catch (error) {
    console.error('[Instagram] Error fetching complaints:', error)
    res.status(500).json({ error: 'Internal error' })
  }
})

// GET /api/instagram/instability — resumo de instabilidade atual
router.get('/instability', async (req: Request, res: Response) => {
  try {
    const supabase = (await import('../config/database')).default
    const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const [last15, last1h] = await Promise.all([
      supabase
        .from('complaints')
        .select('id, keywords, severity, content')
        .in('source', ['instagram_comment', 'instagram_dm'])
        .gte('detected_at', since15m),
      supabase
        .from('complaints')
        .select('id, severity')
        .in('source', ['instagram_comment', 'instagram_dm'])
        .gte('detected_at', since1h),
    ])

    const instability15m = (last15.data || []).filter((c) =>
      isInstabilityComplaint(c.content)
    ).length

    res.json({
      status: instability15m >= 5 ? 'critical' : instability15m >= 2 ? 'warning' : 'normal',
      instability_complaints_15m: instability15m,
      total_complaints_15m: (last15.data || []).length,
      total_complaints_1h: (last1h.data || []).length,
      spike_threshold: 5,
      checked_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Instagram] Instability check error:', error)
    res.status(500).json({ error: 'Internal error' })
  }
})

// POST /api/instagram/analyze — análise IA de lote de comentários
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] is required' })
    }

    const texts = messages.map((m: { text?: string }) => m.text || String(m))
    const analysis = await openaiService.analyzeComplaints(texts)

    for (const text of texts) {
      await supabaseService.saveComplaint({
        source: 'instagram_comment',
        content: text,
        severity: analysis.severity as 'critical' | 'high' | 'medium' | 'low',
        category: analysis.category,
        keywords: detectKeywords(text),
      })
    }

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
    console.error('[Instagram] AI analysis error:', error)
    res.status(500).json({ error: 'Analysis failed' })
  }
})

// POST /api/instagram/poll — forçar varredura manual via Graph API
router.post('/poll', async (req: Request, res: Response) => {
  try {
    const result = await instagramService.pollRecentComments()
    res.json(result)
  } catch (error) {
    console.error('[Instagram] Poll error:', error)
    res.status(500).json({ error: 'Poll failed' })
  }
})

export default router
