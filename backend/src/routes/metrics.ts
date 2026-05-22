import { Router, Request, Response } from 'express'
import supabaseService from '../services/supabaseService'
import nuvemshopService from '../services/nuvemshopService'

const router = Router()

// GET /api/metrics/sales - get sales metrics (last 24h)
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24
    const history = await supabaseService.getSalesHistory(hours)
    res.json({ sales: history, count: history.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching sales:', error)
    res.status(500).json({ error: 'Failed to fetch sales metrics' })
  }
})

// GET /api/metrics/payments - get payment metrics
router.get('/payments', async (_req: Request, res: Response) => {
  try {
    const history = await supabaseService.getSalesHistory(24)

    if (history.length === 0) {
      return res.json({
        card_approval_rate: null,
        pix_approval_rate: null,
        total_orders: 0,
        pix_orders: 0,
        card_orders: 0,
        message: 'No data available',
      })
    }

    const latest = history[history.length - 1]
    const totalOrders = latest.orders_count || 0
    const pixOrders = latest.pix_orders || 0
    const cardOrders = latest.card_orders || 0

    res.json({
      total_orders: totalOrders,
      pix_orders: pixOrders,
      card_orders: cardOrders,
      pix_rate: totalOrders > 0 ? (pixOrders / totalOrders) * 100 : 0,
      card_rate: totalOrders > 0 ? (cardOrders / totalOrders) * 100 : 0,
      snapshot_at: latest.snapshot_at,
    })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching payments:', error)
    res.status(500).json({ error: 'Failed to fetch payment metrics' })
  }
})

// GET /api/metrics/system - get system health
router.get('/system', async (_req: Request, res: Response) => {
  try {
    const health = await supabaseService.getSystemHealth()
    res.json({ services: health, count: health.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching system health:', error)
    res.status(500).json({ error: 'Failed to fetch system health' })
  }
})

// POST /api/metrics/sales - save new sales snapshot
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

// GET /api/metrics/nuvemshop/live - fetch live from Nuvemshop
router.get('/nuvemshop/live', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const orders = await nuvemshopService.fetchOrders(since)
    const metrics = nuvemshopService.computeMetrics(orders)
    res.json({ metrics, orders_fetched: orders.length })
  } catch (error) {
    console.error('[MetricsRoute] Error fetching live Nuvemshop metrics:', error)
    res.status(500).json({ error: 'Failed to fetch Nuvemshop metrics' })
  }
})

export default router
