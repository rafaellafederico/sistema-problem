import axios, { AxiosInstance } from 'axios'
import dotenv from 'dotenv'

dotenv.config()

export interface NuvemshopOrder {
  id: number
  number: string
  status: string
  payment_status: string
  total: string
  subtotal: string
  discount: string
  gateway: string
  payment_details?: {
    method: string
    installments?: number
  }
  coupon?: Array<{ code: string; discount_amount: string }>
  created_at: string
  updated_at: string
  customer?: {
    id: number
    email: string
    name: string
  }
}

export interface NuvemshopMetrics {
  revenue_brl: number
  orders_count: number
  avg_ticket_brl: number
  conversion_rate: number
  pix_orders: number
  card_orders: number
  boleto_orders: number
  coupon_uses: number
  refund_count: number
  cancelled_count: number
  period_start: string
  period_end: string
}

export interface AnomalyDetectionResult {
  detected: boolean
  type: string
  metric: string
  current_value: number
  baseline_value: number
  deviation_percent: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
}

class NuvemshopService {
  private client: AxiosInstance
  private storeId: string
  private baselineMetrics: Partial<NuvemshopMetrics> | null = null

  constructor() {
    const storeId = process.env.NUVEMSHOP_STORE_ID || '0'
    const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN || ''

    this.storeId = storeId

    this.client = axios.create({
      baseURL: `https://api.nuvemshop.com.br/v1/${storeId}`,
      headers: {
        Authentication: `bearer ${accessToken}`,
        'User-Agent': 'SaintGermain-Central/1.0',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status
        const msg = error.response?.data?.description || error.message
        console.error(`[NuvemshopService] API Error ${status}: ${msg}`)
        return Promise.reject(error)
      }
    )
  }

  async fetchOrders(since: Date, status?: string): Promise<NuvemshopOrder[]> {
    const params: Record<string, string | number> = {
      created_at_min: since.toISOString(),
      per_page: 200,
      page: 1,
    }

    if (status) {
      params.payment_status = status
    }

    const allOrders: NuvemshopOrder[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      params.page = page
      const response = await this.client.get<NuvemshopOrder[]>('/orders', { params })
      const orders = response.data

      allOrders.push(...orders)

      if (orders.length < 200) {
        hasMore = false
      } else {
        page++
      }
    }

    return allOrders
  }

  computeMetrics(orders: NuvemshopOrder[]): NuvemshopMetrics {
    const now = new Date()
    const periodStart =
      orders.length > 0
        ? orders.reduce(
            (min, o) => (new Date(o.created_at) < new Date(min) ? o.created_at : min),
            orders[0].created_at
          )
        : now.toISOString()

    // Only count fully settled payments (matches Nuvemshop "Vendas totais")
    const paidOrders = orders.filter((o) => o.payment_status === 'paid')
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled')
    const refundedOrders = orders.filter((o) => o.payment_status === 'refunded')

    const revenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0)
    const avgTicket = paidOrders.length > 0 ? revenue / paidOrders.length : 0

    const pixOrders = paidOrders.filter(
      (o) =>
        o.gateway?.toLowerCase().includes('pix') ||
        o.payment_details?.method?.toLowerCase().includes('pix')
    )

    const cardOrders = paidOrders.filter(
      (o) =>
        o.gateway?.toLowerCase().includes('credit') ||
        o.gateway?.toLowerCase().includes('card') ||
        o.payment_details?.method?.toLowerCase().includes('credit_card')
    )

    const boletoOrders = paidOrders.filter(
      (o) =>
        o.gateway?.toLowerCase().includes('boleto') ||
        o.payment_details?.method?.toLowerCase().includes('boleto')
    )

    const couponUses = orders.filter((o) => o.coupon && o.coupon.length > 0).length

    // Conversion rate: estimate based on orders vs expected sessions
    // We use total orders / total orders * 100 as a simplified measure
    // In production, this would pull from analytics
    const conversionRate = orders.length > 0
      ? (paidOrders.length / orders.length) * 100
      : 0

    return {
      revenue_brl: Math.round(revenue * 100) / 100,
      orders_count: paidOrders.length,
      avg_ticket_brl: Math.round(avgTicket * 100) / 100,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      pix_orders: pixOrders.length,
      card_orders: cardOrders.length,
      boleto_orders: boletoOrders.length,
      coupon_uses: couponUses,
      refund_count: refundedOrders.length,
      cancelled_count: cancelledOrders.length,
      period_start: periodStart,
      period_end: now.toISOString(),
    }
  }

  detectAnomalies(
    current: NuvemshopMetrics,
    historical: NuvemshopMetrics
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = []

    // Sales drop detection
    if (historical.revenue_brl > 0) {
      const revenueDrop =
        ((historical.revenue_brl - current.revenue_brl) / historical.revenue_brl) * 100
      if (revenueDrop >= 30) {
        anomalies.push({
          detected: true,
          type: 'sales_drop',
          metric: 'revenue_brl',
          current_value: current.revenue_brl,
          baseline_value: historical.revenue_brl,
          deviation_percent: revenueDrop,
          severity: revenueDrop >= 50 ? 'critical' : revenueDrop >= 40 ? 'high' : 'medium',
          description: `Faturamento caiu ${revenueDrop.toFixed(1)}% em relação à baseline. Atual: R$${current.revenue_brl.toFixed(2)} vs baseline R$${historical.revenue_brl.toFixed(2)}`,
        })
      }
    }

    // Conversion rate drop detection
    if (historical.conversion_rate > 0) {
      const conversionDrop =
        ((historical.conversion_rate - current.conversion_rate) /
          historical.conversion_rate) *
        100
      if (conversionDrop >= 25) {
        anomalies.push({
          detected: true,
          type: 'conversion_drop',
          metric: 'conversion_rate',
          current_value: current.conversion_rate,
          baseline_value: historical.conversion_rate,
          deviation_percent: conversionDrop,
          severity: conversionDrop >= 40 ? 'critical' : 'high',
          description: `Taxa de conversão caiu ${conversionDrop.toFixed(1)}%. Atual: ${current.conversion_rate.toFixed(2)}% vs baseline ${historical.conversion_rate.toFixed(2)}%`,
        })
      }
    }

    // Orders volume drop
    if (historical.orders_count > 0) {
      const orderDrop =
        ((historical.orders_count - current.orders_count) / historical.orders_count) * 100
      if (orderDrop >= 35) {
        anomalies.push({
          detected: true,
          type: 'order_volume_drop',
          metric: 'orders_count',
          current_value: current.orders_count,
          baseline_value: historical.orders_count,
          deviation_percent: orderDrop,
          severity: orderDrop >= 50 ? 'critical' : 'high',
          description: `Volume de pedidos caiu ${orderDrop.toFixed(1)}%. Atual: ${current.orders_count} vs baseline ${historical.orders_count}`,
        })
      }
    }

    // Payment method shift detection
    const totalCurrent = current.pix_orders + current.card_orders + current.boleto_orders
    const totalHistorical = historical.pix_orders + historical.card_orders + historical.boleto_orders

    if (totalCurrent >= 3 && totalHistorical >= 3) {
      const currentPixPct = (current.pix_orders / totalCurrent) * 100
      const currentCardPct = (current.card_orders / totalCurrent) * 100
      const historicalPixPct = (historical.pix_orders / totalHistorical) * 100
      const historicalCardPct = (historical.card_orders / totalHistorical) * 100

      const pixShift = currentPixPct - historicalPixPct
      const cardShift = currentCardPct - historicalCardPct

      // PIX growing fast while card drops → possible card gateway issue
      if (pixShift >= 20 && cardShift <= -15) {
        anomalies.push({
          detected: true,
          type: 'payment_shift_pix_surge',
          metric: 'pix_orders',
          current_value: currentPixPct,
          baseline_value: historicalPixPct,
          deviation_percent: pixShift,
          severity: pixShift >= 35 ? 'high' : 'medium',
          description: `Mix de pagamento mudou: PIX subiu ${pixShift.toFixed(0)}pp (de ${historicalPixPct.toFixed(0)}% → ${currentPixPct.toFixed(0)}%), cartão caiu ${Math.abs(cardShift).toFixed(0)}pp (de ${historicalCardPct.toFixed(0)}% → ${currentCardPct.toFixed(0)}%). Possível problema no gateway de cartão.`,
        })
      }

      // Card growing fast while PIX drops → unusual, flag it
      if (cardShift >= 20 && pixShift <= -15) {
        anomalies.push({
          detected: true,
          type: 'payment_shift_card_surge',
          metric: 'card_orders',
          current_value: currentCardPct,
          baseline_value: historicalCardPct,
          deviation_percent: cardShift,
          severity: 'medium',
          description: `Mix de pagamento mudou: cartão subiu ${cardShift.toFixed(0)}pp (de ${historicalCardPct.toFixed(0)}% → ${currentCardPct.toFixed(0)}%), PIX caiu ${Math.abs(pixShift).toFixed(0)}pp. Verificar se há problema no fluxo de PIX.`,
        })
      }

      // Any single method completely disappearing
      if (historicalCardPct >= 10 && currentCardPct === 0 && totalCurrent >= 5) {
        anomalies.push({
          detected: true,
          type: 'payment_method_down',
          metric: 'card_orders',
          current_value: 0,
          baseline_value: historicalCardPct,
          deviation_percent: 100,
          severity: 'critical',
          description: `Pagamento por cartão zerou nos últimos ${totalCurrent} pedidos. Era ${historicalCardPct.toFixed(0)}% do mix. Gateway de cartão pode estar fora do ar.`,
        })
      }

      if (historicalPixPct >= 10 && currentPixPct === 0 && totalCurrent >= 5) {
        anomalies.push({
          detected: true,
          type: 'payment_method_down',
          metric: 'pix_orders',
          current_value: 0,
          baseline_value: historicalPixPct,
          deviation_percent: 100,
          severity: 'critical',
          description: `Pagamento por PIX zerou nos últimos ${totalCurrent} pedidos. Era ${historicalPixPct.toFixed(0)}% do mix. Verificar integração PIX.`,
        })
      }
    }

    return anomalies
  }

  // Break orders into hourly BRT buckets for revenue chart (today vs yesterday)
  computeHourlySales(
    orders: NuvemshopOrder[],
    todayStartUTC: Date
  ): Array<{ hour: string; today: number; yesterday: number }> {
    const yesterdayStartUTC = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000)

    const hourlyMap: Record<string, { today: number; yesterday: number }> = {}
    for (let h = 0; h < 24; h++) {
      hourlyMap[`${String(h).padStart(2, '0')}:00`] = { today: 0, yesterday: 0 }
    }

    const paidOrders = orders.filter((o) => o.payment_status === 'paid')

    for (const order of paidOrders) {
      const orderDate = new Date(order.created_at)
      // Brazil is always UTC-3 (no DST since 2019)
      const brHour = ((orderDate.getUTCHours() - 3) + 24) % 24
      const label = `${String(brHour).padStart(2, '0')}:00`
      const revenue = parseFloat(order.total || '0')

      if (orderDate >= todayStartUTC) {
        hourlyMap[label].today += revenue
      } else if (orderDate >= yesterdayStartUTC) {
        hourlyMap[label].yesterday += revenue
      }
    }

    return Object.entries(hourlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, v]) => ({
        hour,
        today: Math.round(v.today * 100) / 100,
        yesterday: Math.round(v.yesterday * 100) / 100,
      }))
  }

  // Break orders into hourly buckets for payment method analysis
  computeHourlyPaymentMix(orders: NuvemshopOrder[]): Array<{
    hour: string
    pix: number
    card: number
    boleto: number
    total: number
    pix_pct: number
    card_pct: number
  }> {
    const buckets: Record<string, { pix: number; card: number; boleto: number; total: number }> = {}

    // Only count fully settled payments (matches Nuvemshop "Vendas totais")
    const paidOrders = orders.filter((o) => o.payment_status === 'paid')

    for (const order of paidOrders) {
      const date = new Date(order.created_at)
      const hour = `${String(date.getHours()).padStart(2, '0')}:00`
      if (!buckets[hour]) buckets[hour] = { pix: 0, card: 0, boleto: 0, total: 0 }

      const isPix =
        order.gateway?.toLowerCase().includes('pix') ||
        order.payment_details?.method?.toLowerCase().includes('pix')
      const isCard =
        order.gateway?.toLowerCase().includes('credit') ||
        order.gateway?.toLowerCase().includes('card') ||
        order.payment_details?.method?.toLowerCase().includes('credit_card')
      const isBoleto =
        order.gateway?.toLowerCase().includes('boleto') ||
        order.payment_details?.method?.toLowerCase().includes('boleto')

      if (isPix) buckets[hour].pix++
      else if (isCard) buckets[hour].card++
      else if (isBoleto) buckets[hour].boleto++

      buckets[hour].total++
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, v]) => ({
        hour,
        ...v,
        pix_pct: v.total > 0 ? Math.round((v.pix / v.total) * 100) : 0,
        card_pct: v.total > 0 ? Math.round((v.card / v.total) * 100) : 0,
      }))
  }

  // Approval rate for credit card orders only (Appmax gateway)
  // Formula: paid / (paid + voided) × 100
  // Uses payment_details.method as primary discriminator to exclude Appmax PIX/boleto
  // voided orders from being counted as refused card transactions.
  computeCardApprovalRate(orders: NuvemshopOrder[]): {
    approved: number
    refused: number
    rate: number
  } {
    const isCreditCard = (o: NuvemshopOrder): boolean => {
      const method = o.payment_details?.method?.toLowerCase() ?? ''
      if (method) return method === 'credit_card'
      // Fallback when payment_details absent: gateway name, excluding pix/boleto
      const gateway = o.gateway?.toLowerCase() ?? ''
      return (gateway.includes('credit') || gateway.includes('card')) &&
        !gateway.includes('pix') && !gateway.includes('boleto')
    }

    const cardOrders = orders.filter(isCreditCard)
    const approved = cardOrders.filter((o) => o.payment_status === 'paid').length
    const refused = cardOrders.filter((o) => o.payment_status === 'voided').length
    const total = approved + refused

    return {
      approved,
      refused,
      rate: total > 0 ? Math.round((approved / total) * 1000) / 10 : 0,
    }
  }

  setBaseline(metrics: NuvemshopMetrics): void {
    this.baselineMetrics = metrics
  }

  getBaseline(): Partial<NuvemshopMetrics> | null {
    return this.baselineMetrics
  }

  async checkStoreHealth(): Promise<{ online: boolean; responseTime: number }> {
    const start = Date.now()
    try {
      await this.client.get('/store', { timeout: 5000 })
      return { online: true, responseTime: Date.now() - start }
    } catch {
      return { online: false, responseTime: Date.now() - start }
    }
  }
}

export const nuvemshopService = new NuvemshopService()
export default nuvemshopService
