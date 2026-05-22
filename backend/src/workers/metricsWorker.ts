import cron from 'node-cron'
import axios from 'axios'
import supabaseService from '../services/supabaseService'
import nuvemshopService, { NuvemshopMetrics } from '../services/nuvemshopService'
import openaiService from '../services/openaiService'
import evolutionApiService from '../services/evolutionApiService'
import anomalyDetector from './anomalyDetector'

const SITE_URL = process.env.SITE_URL || 'https://www.saintgermain.com.br'

let lastKnownMetrics: NuvemshopMetrics | null = null
let siteWasOffline = false

async function fetchAndAnalyzeMetrics(): Promise<void> {
  try {
    console.log('[MetricsWorker] Fetching Nuvemshop metrics...')

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000) // last 2 hours
    const orders = await nuvemshopService.fetchOrders(since)
    const currentMetrics = nuvemshopService.computeMetrics(orders)

    // Save to DB
    await supabaseService.saveSalesMetric({
      revenue_brl: currentMetrics.revenue_brl,
      orders_count: currentMetrics.orders_count,
      avg_ticket_brl: currentMetrics.avg_ticket_brl,
      conversion_rate: currentMetrics.conversion_rate,
      pix_orders: currentMetrics.pix_orders,
      card_orders: currentMetrics.card_orders,
      boleto_orders: currentMetrics.boleto_orders,
      coupon_uses: currentMetrics.coupon_uses,
    })

    // Detect anomalies vs last snapshot
    if (lastKnownMetrics) {
      const anomalies = nuvemshopService.detectAnomalies(currentMetrics, lastKnownMetrics)

      for (const anomaly of anomalies) {
        console.log(`[MetricsWorker] Anomaly detected: ${anomaly.type} (${anomaly.severity})`)

        // Save alert
        const alert = await supabaseService.saveAlert({
          severity: anomaly.severity,
          module: 'Vendas',
          title: anomaly.description.substring(0, 100),
          description: anomaly.description,
          source: 'nuvemshop',
          metadata: {
            anomaly_type: anomaly.type,
            metric_value: anomaly.current_value,
            baseline_value: anomaly.baseline_value,
            deviation_percent: anomaly.deviation_percent,
          },
        })

        // Save anomaly log
        await supabaseService.saveAnomalyLog({
          anomaly_type: anomaly.type,
          module: 'Vendas',
          description: anomaly.description,
          severity: anomaly.severity,
          metric_value: anomaly.current_value,
          baseline_value: anomaly.baseline_value,
          deviation_percent: anomaly.deviation_percent,
        })

        // Send WhatsApp alert for high/critical
        if (
          (anomaly.severity === 'critical' || anomaly.severity === 'high') &&
          alert
        ) {
          await evolutionApiService.sendAlertMessage({
            severity: anomaly.severity,
            module: 'Vendas',
            title: anomaly.type,
            description: anomaly.description,
          })

          if (alert.id) {
            await supabaseService.markAlertNotified(alert.id)
          }
        }
      }
    }

    lastKnownMetrics = currentMetrics
    console.log(
      `[MetricsWorker] Metrics snapshot saved — revenue: R$${currentMetrics.revenue_brl}, orders: ${currentMetrics.orders_count}`
    )
  } catch (error) {
    console.error('[MetricsWorker] Error fetching metrics:', error)
  }
}

async function checkSiteUptime(): Promise<void> {
  const start = Date.now()
  let status: 'online' | 'degraded' | 'offline' = 'offline'
  let responseTime = 0
  let statusCode: number | undefined
  let errorMessage: string | undefined

  try {
    const response = await axios.get(SITE_URL, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'SaintGermain-UptimeBot/1.0' },
    })

    responseTime = Date.now() - start
    statusCode = response.status

    if (response.status >= 200 && response.status < 400) {
      status = responseTime > 3000 ? 'degraded' : 'online'
    } else {
      status = 'offline'
      errorMessage = `HTTP ${response.status}`
    }
  } catch (error) {
    responseTime = Date.now() - start
    status = 'offline'
    errorMessage = error instanceof Error ? error.message : 'Unknown error'
  }

  // Save health check
  await supabaseService.saveSystemHealth({
    service: 'site',
    status,
    response_time_ms: responseTime,
    status_code: statusCode,
    error_message: errorMessage,
  })

  // Alert on status change to offline
  if (status === 'offline' && !siteWasOffline) {
    siteWasOffline = true
    console.log('[MetricsWorker] Site went OFFLINE — sending critical alert')

    await supabaseService.saveAlert({
      severity: 'critical',
      module: 'Site',
      title: `Site fora do ar — ${SITE_URL}`,
      description: `O site reportou status ${status}. ${errorMessage || `HTTP ${statusCode || 'timeout'}`}. Tempo de resposta: ${responseTime}ms.`,
      source: 'monitoramento',
      metadata: { url: SITE_URL, response_time_ms: responseTime, status_code: statusCode },
    })

    await evolutionApiService.sendAlertMessage({
      severity: 'critical',
      module: 'Site',
      title: 'Site Fora do Ar',
      description: `${SITE_URL} não está respondendo. ${errorMessage || ''}. Tempo de resposta: ${responseTime}ms.`,
    })
  } else if (status === 'online' && siteWasOffline) {
    siteWasOffline = false
    console.log('[MetricsWorker] Site recovered — back online')
    await supabaseService.saveAlert({
      severity: 'low',
      module: 'Site',
      title: 'Site recuperado — voltou ao ar',
      description: `O site voltou ao ar com tempo de resposta ${responseTime}ms.`,
      source: 'monitoramento',
      status: 'resolved',
    })
  }
}

async function runAIAnalysis(): Promise<void> {
  try {
    console.log('[MetricsWorker] Running AI analysis...')

    const recentAlerts = await supabaseService.getAlerts({
      status: 'open,investigating',
      limit: 10,
    })

    if (recentAlerts.length === 0) {
      console.log('[MetricsWorker] No open alerts to analyze')
      return
    }

    if (!lastKnownMetrics) {
      console.log('[MetricsWorker] No metrics available for AI analysis')
      return
    }

    const insight = await openaiService.generateInsight({
      type: 'general',
      metrics: {
        revenue_brl: lastKnownMetrics.revenue_brl,
        orders_count: lastKnownMetrics.orders_count,
        conversion_rate: lastKnownMetrics.conversion_rate,
        pix_orders: lastKnownMetrics.pix_orders,
        card_orders: lastKnownMetrics.card_orders,
      },
      alerts: recentAlerts.map(
        (a) => `[${a.severity}] ${a.module}: ${a.title}`
      ),
      timeframe: 'últimas 2 horas',
    })

    await supabaseService.saveAIInsight({
      insight_type: insight.insight_type,
      title: insight.title,
      summary: insight.summary,
      confidence: insight.confidence,
      severity: insight.severity,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })

    console.log(`[MetricsWorker] AI insight saved: "${insight.title}"`)
  } catch (error) {
    console.error('[MetricsWorker] AI analysis error:', error)
  }
}

export function startMetricsWorker(): void {
  console.log('[MetricsWorker] Starting cron jobs...')

  // Every 5 minutes: fetch Nuvemshop metrics
  cron.schedule('*/5 * * * *', async () => {
    await fetchAndAnalyzeMetrics()
  })

  // Every 1 minute: site uptime check
  cron.schedule('* * * * *', async () => {
    await checkSiteUptime()
  })

  // Every 15 minutes: AI analysis
  cron.schedule('*/15 * * * *', async () => {
    await runAIAnalysis()
  })

  console.log('[MetricsWorker] Cron jobs registered successfully')
}

export { fetchAndAnalyzeMetrics, checkSiteUptime, runAIAnalysis }
