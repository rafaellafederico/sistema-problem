import { Router, Request, Response } from 'express'
import supabaseService from '../services/supabaseService'
import nuvemshopService from '../services/nuvemshopService'

const router = Router()

// Brazil is UTC-3, no DST since 2019. Today starts at 03:00 UTC.
function getBrazilMidnightUTC(): Date {
  const now = new Date()
  const d = new Date(now)
  d.setUTCHours(3, 0, 0, 0)
  if (now.getUTCHours() < 3) d.setUTCDate(d.getUTCDate() - 1)
  return d
}

// GET /api/metrics/sales
// ?type=hourly  → { data: HourlySalesPoint[] }
// default       → { metrics: { revenue_brl, orders_count, avg_ticket_brl, pix_orders, card_orders, coupon_uses } }
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined
    const todayStart = getBrazilMidnightUTC()
    const hasNuvemshop = !!(process.env.NUVEMSHOP_STORE_ID && process.env.NUVEMSHOP_ACCESS_TOKEN)

    // ── Hourly chart data ──────────────────────────────────────────────────
    if (type === 'hourly') {
      // Nuvemshop is primary for hourly: gives accurate per-order BRT timestamps.
      // Supabase snapshots accumulate within hours and can't be reliably split by delta.
      if (hasNuvemshop) {
        try {
          const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
          const orders = await nuvemshopService.fetchOrders(yesterdayStart)
          const data = nuvemshopService.computeHourlySales(orders, todayStart)
          return res.json({ data, source: 'live' })
        } catch (err) {
          console.error('[MetricsRoute] Nuvemshop hourly failed, falling back to Supabase:', err)
        }
      }

      // Supabase fallback (accurate only when worker stores per-interval deltas)
      const history = await supabaseService.getSalesHistory(48)
      const hourlyMap: Record<string, { today: number; yesterday: number }> = {}
      for (let h = 0; h < 24; h++) {
        hourlyMap[`${String(h).padStart(2, '0')}:00`] = { today: 0, yesterday: 0 }
      }
      for (const row of history) {
        const date = new Date(row.snapshot_at ?? '')
        const brHour = ((date.getUTCHours() - 3) + 24) % 24
        const label = `${String(brHour).padStart(2, '0')}:00`
        const isToday = date >= todayStart
        const isYesterday = date >= new Date(todayStart.getTime() - 24 * 60 * 60 * 1000) && !isToday
        if (isToday) hourlyMap[label].today += row.revenue_brl
        else if (isYesterday) hourlyMap[label].yesterday += row.revenue_brl
      }
      return res.json({ data: Object.entries(hourlyMap).map(([hour, v]) => ({ hour, ...v })) })
    }

    // ── Summary metrics ────────────────────────────────────────────────────
    // Nuvemshop is primary. Fetch 48h so we can compute today vs yesterday comparisons.
    if (hasNuvemshop) {
      try {
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        const allOrders = await nuvemshopService.fetchOrders(yesterdayStart)

        const todayOrders = allOrders.filter((o) => new Date(o.created_at) >= todayStart)
        const yesterdayOrders = allOrders.filter((o) => {
          const d = new Date(o.created_at)
          return d >= yesterdayStart && d < todayStart
        })

        const todayM = nuvemshopService.computeMetrics(todayOrders)
        const yestM = nuvemshopService.computeMetrics(yesterdayOrders)

        const pct = (curr: number, prev: number): number =>
          prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : 0

        return res.json({
          metrics: {
            revenue_brl: todayM.revenue_brl,
            revenue_change_pct: pct(todayM.revenue_brl, yestM.revenue_brl),
            orders_count: todayM.orders_count,
            orders_change_pct: pct(todayM.orders_count, yestM.orders_count),
            avg_ticket_brl: todayM.avg_ticket_brl,
            avg_ticket_change_pct: pct(todayM.avg_ticket_brl, yestM.avg_ticket_brl),
            pix_orders: todayM.pix_orders,
            pix_change_pct: pct(todayM.pix_orders, yestM.pix_orders),
            card_orders: todayM.card_orders,
            coupon_uses: todayM.coupon_uses,
            coupon_change_pct: pct(todayM.coupon_uses, yestM.coupon_uses),
            conversion_rate: todayM.conversion_rate,
            conversion_change_pct: pct(todayM.conversion_rate, yestM.conversion_rate),
          },
          source: 'live',
        })
      } catch (err) {
        console.error('[MetricsRoute] Nuvemshop summary failed, falling back to Supabase:', err)
      }
    }

    // Supabase fallback
    const history = await supabaseService.getSalesHistory(24)
    const todayHistory = history.filter(
      (r) => r.snapshot_at && new Date(r.snapshot_at) >= todayStart
    )
    if (todayHistory.length === 0) {
      return res.json({ metrics: null })
    }
    const latest = todayHistory[todayHistory.length - 1]
    const derivedAvgTicket =
      latest.orders_count > 0
        ? Math.round((latest.revenue_brl / latest.orders_count) * 100) / 100
        : 0
    return res.json({
      metrics: {
        revenue_brl: latest.revenue_brl,
        orders_count: latest.orders_count,
        avg_ticket_brl: derivedAvgTicket,
        pix_orders: latest.pix_orders,
        card_orders: latest.card_orders,
        coupon_uses: latest.coupon_uses ?? 0,
      },
      snapshot_at: latest.snapshot_at,
      source: 'supabase',
    })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching sales:', error)
    res.status(500).json({ error: 'Failed to fetch sales metrics' })
  }
})

// GET /api/metrics/payments → { metrics: { card_approval_rate, card_approved, card_refused } }
// card_approval_rate = paid / (paid + voided) × 100 — filters Appmax credit card orders only
router.get('/payments', async (_req: Request, res: Response) => {
  try {
    const hasNuvemshop = !!(process.env.NUVEMSHOP_STORE_ID && process.env.NUVEMSHOP_ACCESS_TOKEN)

    if (hasNuvemshop) {
      try {
        const todayStart = getBrazilMidnightUTC()
        const orders = await nuvemshopService.fetchOrders(todayStart)
        const approval = nuvemshopService.computeCardApprovalRate(orders)

        return res.json({
          metrics: {
            card_approval_rate: approval.rate,
            card_approved: approval.approved,
            card_refused: approval.refused,
          },
          source: 'live',
        })
      } catch (err) {
        console.error('[MetricsRoute] Nuvemshop payments failed, falling back to Supabase:', err)
      }
    }

    // Supabase fallback — card mix ratio only, not true approval rate
    const history = await supabaseService.getSalesHistory(24)
    if (history.length === 0) return res.json({ metrics: null })

    const latest = history[history.length - 1]
    const total = latest.orders_count || 0
    const card = latest.card_orders || 0
    const pix = latest.pix_orders || 0

    return res.json({
      metrics: {
        card_approval_rate: total > 0 ? Math.round((card / total) * 1000) / 10 : 0,
        pix_rate: total > 0 ? Math.round((pix / total) * 1000) / 10 : 0,
        total_orders: total,
        pix_orders: pix,
        card_orders: card,
      },
      snapshot_at: latest.snapshot_at,
      source: 'supabase',
    })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching payments:', error)
    res.status(500).json({ error: 'Failed to fetch payment metrics' })
  }
})

// GET /api/metrics/system → { health: [{ service, status, uptime_percent, response_time_ms }] }
router.get('/system', async (_req: Request, res: Response) => {
  try {
    const records = await supabaseService.getSystemHealth()
    const health = records.map((r) => ({
      service: r.service,
      status: r.status,
      uptime_percent: r.uptime_percent ?? (r.status === 'online' ? 100 : r.status === 'degraded' ? 95 : 0),
      response_time_ms: r.response_time_ms,
    }))
    return res.json({ health, count: health.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching system health:', error)
    res.status(500).json({ error: 'Failed to fetch system health' })
  }
})

// POST /api/metrics/sales - save new sales snapshot (internal use by worker)
router.post('/sales', async (req: Request, res: Response) => {
  try {
    const {
      revenue_brl,
      orders_count,
      avg_ticket_brl,
      conversion_rate,
      pix_orders,
      card_orders,
      boleto_orders,
      coupon_uses,
      abandoned_carts,
      checkout_sessions,
    } = req.body

    if (revenue_brl === undefined || orders_count === undefined) {
      return res.status(400).json({ error: 'revenue_brl and orders_count are required' })
    }

    const saved = await supabaseService.saveSalesMetric({
      revenue_brl,
      orders_count,
      avg_ticket_brl: avg_ticket_brl ?? (orders_count > 0 ? revenue_brl / orders_count : 0),
      conversion_rate: conversion_rate ?? 0,
      pix_orders: pix_orders ?? 0,
      card_orders: card_orders ?? 0,
      boleto_orders: boleto_orders ?? 0,
      coupon_uses: coupon_uses ?? 0,
      abandoned_carts: abandoned_carts ?? 0,
      checkout_sessions: checkout_sessions ?? 0,
    })

    if (!saved) {
      return res.status(500).json({ error: 'Failed to save metrics' })
    }

    res.status(201).json({ success: true, metric: saved })
  } catch (error) {
    console.error('[MetricsRoute] Error saving sales:', error)
    res.status(500).json({ error: 'Failed to save sales metric' })
  }
})

// GET /api/metrics/payments/hourly - hourly payment method breakdown
// Returns per-hour PIX vs card vs boleto counts and percentages (last 24h)
router.get('/payments/hourly', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const orders = await nuvemshopService.fetchOrders(since)
    const hourlyMix = nuvemshopService.computeHourlyPaymentMix(orders)
    res.json({ data: hourlyMix, orders_analyzed: orders.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching hourly payment mix:', error)
    res.status(500).json({ error: 'Failed to fetch payment mix' })
  }
})

// GET /api/metrics/payments/debug - inspect raw gateway+method values (temporary)
router.get('/payments/debug', async (_req: Request, res: Response) => {
  try {
    const todayStart = getBrazilMidnightUTC()
    const orders = await nuvemshopService.fetchOrders(todayStart)

    const breakdown: Record<string, number> = {}
    for (const o of orders) {
      const key = `${o.payment_status} | gw:${o.gateway ?? 'null'} | method:${o.payment_details?.method ?? 'null'}`
      breakdown[key] = (breakdown[key] ?? 0) + 1
    }

    res.json({ total_orders: orders.length, breakdown })
  } catch (error) {
    console.error('[MetricsRoute] Error in payments debug:', error)
    res.status(500).json({ error: 'Failed' })
  }
})

// GET /api/metrics/nuvemshop/live - fetch live from Nuvemshop (debug/admin)
router.get('/nuvemshop/live', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const orders = await nuvemshopService.fetchOrders(since)
    const metrics = nuvemshopService.computeMetrics(orders)
    const hourlyMix = nuvemshopService.computeHourlyPaymentMix(orders)
    res.json({ metrics, hourly_payment_mix: hourlyMix, orders_fetched: orders.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching live Nuvemshop metrics:', error)
    res.status(500).json({ error: 'Failed to fetch Nuvemshop metrics' })
  }
})

export default router
