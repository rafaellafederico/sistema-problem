import { Router, Request, Response } from 'express'
import supabaseService from '../services/supabaseService'
import evolutionApiService from '../services/evolutionApiService'

const router = Router()

// GET /api/alerts - list alerts with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      severity: req.query.severity as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    }

    const alerts = await supabaseService.getAlerts(filters)
    res.json({ alerts, count: alerts.length })
  } catch (error) {
    console.error('[AlertsRoute] Error fetching alerts:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// GET /api/alerts/summary - counts by severity
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await supabaseService.getAlertSummary()
    const total = Object.values(summary).reduce((s, v) => s + v, 0)
    res.json({ summary, total })
  } catch (error) {
    console.error('[AlertsRoute] Error fetching summary:', error)
    res.status(500).json({ error: 'Failed to fetch alert summary' })
  }
})

// POST /api/alerts - create alert
router.post('/', async (req: Request, res: Response) => {
  try {
    const { severity, module, title, description, source, metadata, status } = req.body

    if (!severity || !module || !title || !description) {
      return res
        .status(400)
        .json({ error: 'severity, module, title and description are required' })
    }

    const validSeverities = ['critical', 'high', 'medium', 'low']
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${validSeverities.join(', ')}` })
    }

    const alert = await supabaseService.saveAlert({
      severity,
      module,
      title,
      description,
      source,
      metadata,
      status,
    })

    if (!alert) {
      return res.status(500).json({ error: 'Failed to save alert' })
    }

    // Auto-send WhatsApp for critical/high alerts
    if (severity === 'critical' || severity === 'high') {
      const sent = await evolutionApiService.sendAlertMessage({
        severity,
        module,
        title,
        description,
      })

      if ((sent.phone || sent.group) && alert.id) {
        await supabaseService.markAlertNotified(alert.id)
      }
    }

    res.status(201).json({ success: true, alert })
  } catch (error) {
    console.error('[AlertsRoute] Error creating alert:', error)
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

// PATCH /api/alerts/:id - update alert status
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, resolved_at } = req.body

    if (!status) {
      return res.status(400).json({ error: 'status is required' })
    }

    const validStatuses = ['open', 'investigating', 'resolved', 'false_positive']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` })
    }

    const success = await supabaseService.updateAlertStatus(id, status, resolved_at)

    if (!success) {
      return res.status(500).json({ error: 'Failed to update alert' })
    }

    res.json({ success: true, id, status })
  } catch (error) {
    console.error('[AlertsRoute] Error updating alert:', error)
    res.status(500).json({ error: 'Failed to update alert' })
  }
})

export default router
