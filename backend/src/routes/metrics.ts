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

    // ── Hourly chart data ──────────────────────────────────────────────────
    if (type === 'hourly') {
      const history = await supabaseService.getSalesHistory(48)

      // Map DB snapshots to { hour, today, yesterday } format
      const now = new Date()
      const hourlyMap: Record<string, { today: number; yesterday: number }> = {}

      for (let h = 0; h < 24; h++) {
        const label = `${String(h).padStart(2, '0')}:00`
        hourlyMap[label] = { today: 0, yesterday: 0 }
      }

      for (const row of history) {
        const date = new Date(row.snapshot_at ?? '')
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        const label = `${String(date.getHours()).padStart(2, '0')}:00`
        if (diffDays === 0) hourlyMap[label].today += row.revenue_brl
        else if (diffDays === 1) hourlyMap[label].yesterday += row.revenue_brl
      }

      const data = Object.entries(hourlyMap).map(([hour, v]) => ({ hour, ...v }))
      return res.json({ data })
    }

    // ── Latest snapshot metrics ────────────────────────────────────────────
    let history = await supabaseService.getSalesHistory(24)

    // Fallback: fetch live from Nuvemshop if Supabase is empty and creds exist
    if (history.length === 0 && process.env.NUVEMSHOP_STORE_ID && process.env.NUVEMSHOP_ACCESS_TOKEN) {
      try {
        console.log('[MetricsRoute] Supabase empty — fetching live from Nuvemshop')
        const orders = await nuvemshopService.fetchOrders(getBrazilMidnightUTC())
        const live = nuvemshopService.computeMetrics(orders)
        return res.json({
          metrics: {
            revenue_brl: live.revenue_brl,
            orders_count: live.orders_count,
            avg_ticket_brl: live.avg_ticket_brl,
            pix_orders: live.pix_orders,
            card_orders: live.card_orders,
            coupon_uses: live.coupon_uses,
          },
          source: 'live',
        })
      } catch (err) {
        console.error('[MetricsRoute] Nuvemshop live fallback failed:', err)
      }
    }

    if (history.length === 0) {
      return res.json({ metrics: null })
    }

    // Aggregate today's data from all snapshots (sum, not just latest)
    const latest = history[history.length - 1]
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

// GET /api/metrics/payments → { metrics: { card_approval_rate, pix_rate } }
router.get('/payments', async (_req: Request, res: Response) => {
  try {
    const history = await supabaseService.getSalesHistory(24)

    if (history.length === 0) {
      return res.json({ metrics: null })
    }

    const latest = history[history.length - 1]
    const total = latest.orders_count || 0
    const card = latest.card_orders || 0
    const pix = latest.pix_orders || 0

    return res.json({
      metrics: {
        card_approval_rate: total > 0 ? (card / total) * 100 : 0,
        pix_rate: total > 0 ? (pix / total) * 100 : 0,
        total_orders: total,
        pix_orders: pix,
        card_orders: card,
      },
      snapshot_at: latest.snapshot_at,
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
