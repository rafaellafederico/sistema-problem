import cron from 'node-cron'
import axios from 'axios'
import supabaseService from '../services/supabaseService'
import nuvemshopService, { NuvemshopMetrics, NuvemshopOrder } from '../services/nuvemshopService'
import openaiService from '../services/openaiService'
import emailService from '../services/emailService'
import instagramService from '../services/instagramService'
import anomalyDetector from './anomalyDetector'

const SITE_URL = process.env.SITE_URL || 'https://www.saintgermain.com.br'

// Returns midnight of "today" in Brazil time (UTC-3) as a UTC Date object
function getBrazilMidnightUTC(): Date {
  const nowUTC = new Date()
  // Brazil is UTC-3 (no DST since 2019). Day starts at 03:00 UTC.
  const d = new Date(nowUTC)
  d.setUTCHours(3, 0, 0, 0)
  if (nowUTC.getUTCHours() < 3) {
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return d
}

let lastKnownMetrics: NuvemshopMetrics | null = null
let siteWasOffline = false
let lastCardAlertAt: Date | null = null
const CARD_ALERT_COOLDOWN_MS = 30 * 60 * 1000

async function fetchAndAnalyzeMetrics(): Promise<void> {
  try {
    console.log('[MetricsWorker] Fetching Nuvemshop metrics...')

    // Fetch from midnight Brazil time (UTC-3) — matches Nuvemshop "today"
    const todayMidnight = getBrazilMidnightUTC()
    const orders = await nuvemshopService.fetchOrders(todayMidnight)
    const currentMetrics = nuvemshopService.computeMetrics(orders)

    // Hourly payment mix analysis
    const hourlyMix = nuvemshopService.computeHourlyPaymentMix(orders)
    if (hourlyMix.length > 0) {
      const latest = hourlyMix[hourlyMix.length - 1]
      console.log(
        `[MetricsWorker] Payment mix (${latest.hour}): PIX ${latest.pix_pct}% | Card ${latest.card_pct}% | total ${latest.total}`
      )
    }

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

    // Detect anomalies vs last snapshot (includes payment method shift)
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

        // Send email alert for high/critical
        if (
          (anomaly.severity === 'critical' || anomaly.severity === 'high') &&
          alert
        ) {
          await emailService.sendAlertEmail({
            severity: anomaly.severity,
            module: 'Vendas',
            title: anomaly.type,
            description: anomaly.description,
            metadata: {
              metric_value: anomaly.current_value,
              baseline_value: anomaly.baseline_value,
              deviation_percent: anomaly.deviation_percent,
            },
          })

          if (alert.id) {
            await supabaseService.markAlertNotified(alert.id)
          }
        }
      }
    }

    // Card processing health check (reuses orders already fetched)
    await checkCardHealth(orders)

    lastKnownMetrics = currentMetrics
    console.log(
      `[MetricsWorker] Metrics snapshot saved — revenue: R$${currentMetrics.revenue_brl}, orders: ${currentMetrics.orders_count}`
    )
  } catch (error) {
    console.error('[MetricsWorker] Error fetching metrics:', error)
  }
}

// Alerts when credit card authorized orders are stuck (>30 min without capture)
// AND refund rate is elevated — indicates Appmax processing issue
async function checkCardHealth(orders: NuvemshopOrder[]): Promise<void> {
  try {
    const approval = nuvemshopService.computeCardApprovalRate(orders)
    const health = nuvemshopService.computeCardProcessingHealth(orders)

    const total = approval.approved + approval.refunded
    const refundedRate = total > 0 ? approval.refunded / total : 0

    const hasStuck = health.stuck_orders > 0
    const highRefunds = refundedRate > 0.15

    const now = new Date()
    const cooldownPassed = !lastCardAlertAt ||
      now.getTime() - lastCardAlertAt.getTime() > CARD_ALERT_COOLDOWN_MS

    if (hasStuck && highRefunds && cooldownPassed) {
      const severity = health.stuck_orders > 2 || refundedRate > 0.25 ? 'critical' : 'high'
      const refundedPct = (refundedRate * 100).toFixed(1)

      await supabaseService.saveAlert({
        severity,
        module: 'Pagamentos',
        title: `Cartão lento — ${health.stuck_orders} pedido(s) preso(s) em autorizado por ${health.max_wait_min}min`,
        description: `${health.stuck_orders} pedido(s) de cartão aguardam captura há mais de 30 min (máx ${health.max_wait_min}min, média ${health.avg_wait_min}min). Taxa de estorno: ${refundedPct}% (${approval.refunded} em ${total}). Possível falha no processamento da Appmax.`,
        source: 'monitoramento',
        metadata: {
          stuck_orders: health.stuck_orders,
          max_wait_min: health.max_wait_min,
          avg_wait_min: health.avg_wait_min,
          refunded_count: approval.refunded,
          refunded_rate_pct: +refundedPct,
        },
      })

      lastCardAlertAt = now
      console.log(`[MetricsWorker] Card alert: ${health.stuck_orders} stuck, ${refundedPct}% refunded`)
    } else {
      console.log(`[MetricsWorker] Card health OK — approved=${approval.approved}, authorized=${approval.authorized}, refunded=${approval.refunded}, stuck=${health.stuck_orders}`)
    }
  } catch (error) {
    console.error('[MetricsWorker] Card health check error:', error)
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

    await emailService.sendAlertEmail({
      severity: 'critical',
      module: 'Site',
      title: 'Site Fora do Ar',
      description: `${SITE_URL} não está respondendo. ${errorMessage || ''}. Tempo de resposta: ${responseTime}ms.`,
      metadata: { url: SITE_URL, response_time_ms: responseTime, status_code: statusCode },
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

  // Every 10 minutes: poll Instagram Graph API for recent comments
  cron.schedule('*/10 * * * *', async () => {
    await instagramService.pollRecentComments()
  })

  console.log('[MetricsWorker] Cron jobs registered successfully')
}

export { fetchAndAnalyzeMetrics, checkSiteUptime, runAIAnalysis }
