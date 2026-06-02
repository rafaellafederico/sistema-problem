import { Router, Request, Response } from 'express'
import evolutionApiService from '../services/evolutionApiService'
import supabaseService from '../services/supabaseService'
import { generateAndSendDailyReport } from '../workers/metricsWorker'

const router = Router()

// POST /api/whatsapp/send - send message via Evolution API
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body

    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message are required' })
    }

    const success = await evolutionApiService.sendMessage(phone, message)

    if (!success) {
      return res.status(502).json({ error: 'Failed to send message via Evolution API' })
    }

    res.json({ success: true, phone, message_length: message.length })
  } catch (error) {
    console.error('[WhatsAppRoute] Error sending message:', error)
    res.status(500).json({ error: 'Failed to send WhatsApp message' })
  }
})

// GET /api/whatsapp/status - check connection status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await evolutionApiService.checkConnection()
    res.json({ status })
  } catch (error) {
    console.error('[WhatsAppRoute] Error checking status:', error)
    res.status(500).json({ error: 'Failed to check WhatsApp status' })
  }
})

// POST /api/whatsapp/send-alert - send formatted alert message
router.post('/send-alert', async (req: Request, res: Response) => {
  try {
    const { severity, module, title, description, alert_id, timestamp } = req.body

    if (!severity || !module || !title || !description) {
      return res
        .status(400)
        .json({ error: 'severity, module, title and description are required' })
    }

    const validSeverities = ['critical', 'high', 'medium', 'low']
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: `Invalid severity: ${severity}` })
    }

    const results = await evolutionApiService.sendAlertMessage({
      severity,
      module,
      title,
      description,
      timestamp,
    })

    // Mark alert as notified if alert_id provided
    if (alert_id && (results.phone || results.group)) {
      await supabaseService.markAlertNotified(alert_id)
    }

    res.json({
      success: results.phone || results.group,
      sent_to_phone: results.phone,
      sent_to_group: results.group,
    })
  } catch (error) {
    console.error('[WhatsAppRoute] Error sending alert:', error)
    res.status(500).json({ error: 'Failed to send alert message' })
  }
})

// POST /api/whatsapp/send-report - send daily report (manual text)
router.post('/send-report', async (req: Request, res: Response) => {
  try {
    const { report_text } = req.body

    if (!report_text) {
      return res.status(400).json({ error: 'report_text is required' })
    }

    const success = await evolutionApiService.sendDailyReport(report_text)
    res.json({ success })
  } catch (error) {
    console.error('[WhatsAppRoute] Error sending report:', error)
    res.status(500).json({ error: 'Failed to send report' })
  }
})

// GET /api/whatsapp/send-daily-report - generate and send today's full report now (manual trigger)
router.get('/send-daily-report', async (_req: Request, res: Response) => {
  try {
    await generateAndSendDailyReport()
    res.json({ success: true, message: 'Relatório gerado e enviado por e-mail' })
  } catch (error) {
    console.error('[WhatsAppRoute] Error sending daily report:', error)
    res.status(500).json({ error: 'Failed to send daily report' })
  }
})

export default router
