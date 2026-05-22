import { Router, Request, Response } from 'express'
import openaiService from '../services/openaiService'
import supabaseService from '../services/supabaseService'

const router = Router()

// POST /api/ai/analyze - general AI analysis
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { type, metrics, alerts, timeframe } = req.body

    if (!metrics) {
      return res.status(400).json({ error: 'metrics object is required' })
    }

    const insight = await openaiService.generateInsight({
      type: type || 'general',
      metrics,
      alerts: alerts || [],
      timeframe: timeframe || 'últimas 24h',
    })

    // Save to DB
    await supabaseService.saveAIInsight({
      insight_type: insight.insight_type,
      title: insight.title,
      summary: insight.summary,
      confidence: insight.confidence,
      severity: insight.severity,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })

    res.json({ insight })
  } catch (error) {
    console.error('[AIRoute] Error in analyze:', error)
    res.status(500).json({ error: 'AI analysis failed' })
  }
})

// POST /api/ai/detect-anomaly - detect anomaly in metrics
router.post('/detect-anomaly', async (req: Request, res: Response) => {
  try {
    const { current, baseline, period } = req.body

    if (!current || !baseline) {
      return res.status(400).json({ error: 'current and baseline metrics are required' })
    }

    const result = await openaiService.detectOperationalAnomaly({
      current,
      baseline,
      period: period || 'Últimas 2 horas',
    })

    if (result.anomaly_detected) {
      await supabaseService.saveAlert({
        severity: result.severity as 'critical' | 'high' | 'medium' | 'low',
        module: 'IA',
        title: `Anomalia detectada por IA`,
        description: result.description,
        source: 'ai',
        metadata: { confidence: result.confidence, recommendation: result.recommendation },
      })

      await supabaseService.saveAnomalyLog({
        anomaly_type: 'ai_detected',
        module: 'IA',
        description: result.description,
        severity: result.severity as 'critical' | 'high' | 'medium' | 'low',
        ai_analysis: result.recommendation,
      })
    }

    res.json({ result })
  } catch (error) {
    console.error('[AIRoute] Error detecting anomaly:', error)
    res.status(500).json({ error: 'Anomaly detection failed' })
  }
})

// POST /api/ai/summarize-alerts - summarize recent alerts
router.post('/summarize-alerts', async (req: Request, res: Response) => {
  try {
    const { alert_ids } = req.body

    let alerts
    if (alert_ids && Array.isArray(alert_ids) && alert_ids.length > 0) {
      alerts = await supabaseService.getAlerts({ limit: alert_ids.length })
      alerts = alerts.filter((a) => alert_ids.includes(a.id))
    } else {
      alerts = await supabaseService.getAlerts({ status: 'open,investigating', limit: 20 })
    }

    if (alerts.length === 0) {
      return res.json({
        summary: {
          executive_summary: 'Nenhum alerta ativo no momento.',
          critical_actions: [],
          overall_status: 'Normal',
          risk_level: 'low',
        },
      })
    }

    const formatted = alerts.map((a) => ({
      severity: a.severity,
      module: a.module,
      title: a.title,
      description: a.description,
      created_at: a.created_at || new Date().toISOString(),
    }))

    const summary = await openaiService.summarizeAlerts(formatted)
    res.json({ summary, alerts_analyzed: alerts.length })
  } catch (error) {
    console.error('[AIRoute] Error summarizing alerts:', error)
    res.status(500).json({ error: 'Alert summarization failed' })
  }
})

// GET /api/ai/insights - get latest AI insights
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5
    const insights = await supabaseService.getAIInsights(limit)
    res.json({ insights, count: insights.length })
  } catch (error) {
    console.error('[AIRoute] Error fetching insights:', error)
    res.status(500).json({ error: 'Failed to fetch AI insights' })
  }
})

export default router
