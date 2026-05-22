import { Router, Request, Response } from 'express'
import nuvemshopService from '../services/nuvemshopService'
import supabaseService from '../services/supabaseService'
import evolutionApiService from '../services/evolutionApiService'

const router = Router()

// GET /api/nuvemshop/orders - fetch orders from Nuvemshop API
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    const status = req.query.status as string | undefined

    const orders = await nuvemshopService.fetchOrders(since, status)
    res.json({ orders, count: orders.length, since: since.toISOString() })
  } catch (error) {
    console.error('[NuvemshopRoute] Error fetching orders:', error)
    res.status(500).json({ error: 'Failed to fetch orders from Nuvemshop' })
  }
})

// GET /api/nuvemshop/metrics - compute metrics from orders
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const orders = await nuvemshopService.fetchOrders(since)
    const metrics = nuvemshopService.computeMetrics(orders)

    res.json({ metrics, orders_fetched: orders.length, period_hours: hours })
  } catch (error) {
    console.error('[NuvemshopRoute] Error computing metrics:', error)
    res.status(500).json({ error: 'Failed to compute Nuvemshop metrics' })
  }
})

// POST /api/nuvemshop/webhook - receive Nuvemshop webhooks
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-linkedstore-event'] || req.headers['x-nuvemshop-event']
    const body = req.body

    console.log(`[NuvemshopRoute] Webhook received: ${event}`)

    if (event === 'order/paid' || event === 'order/created') {
      const orderId = body.id
      const total = parseFloat(body.total || '0')

      // Save a quick metrics snapshot
      await supabaseService.saveSalesMetric({
        revenue_brl: total,
        orders_count: 1,
        avg_ticket_brl: total,
        conversion_rate: 0,
        pix_orders: body.payment_details?.method?.includes('pix') ? 1 : 0,
        card_orders: body.payment_details?.method?.includes('credit') ? 1 : 0,
        coupon_uses: body.coupon?.length > 0 ? 1 : 0,
      })

      console.log(`[NuvemshopRoute] Order ${orderId} processed — R$${total}`)
    }

    if (event === 'order/cancelled' || event === 'order/failed') {
      await supabaseService.saveAlert({
        severity: 'medium',
        module: 'Pedidos',
        title: `Pedido ${event === 'order/cancelled' ? 'cancelado' : 'com falha'} — #${body.number}`,
        description: `Pedido #${body.number} de R$${body.total || '0'} — ${event}. Cliente: ${body.customer?.email || 'N/A'}`,
        source: 'nuvemshop',
        metadata: { order_id: body.id, order_number: body.number, event },
      })
    }

    // Detect payment failures
    if (event === 'order/payment-rejected') {
      await supabaseService.saveAlert({
        severity: 'high',
        module: 'Pagamentos',
        title: `Pagamento recusado — Pedido #${body.number}`,
        description: `Pedido #${body.number} com pagamento recusado. Gateway: ${body.gateway || 'N/A'}. Valor: R$${body.total || '0'}`,
        source: 'nuvemshop',
        metadata: { order_id: body.id, gateway: body.gateway, event },
      })
    }

    res.status(200).json({ received: true, event })
  } catch (error) {
    console.error('[NuvemshopRoute] Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export default router
