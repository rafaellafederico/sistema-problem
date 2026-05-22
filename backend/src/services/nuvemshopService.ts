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

    const paidOrders = orders.filter(
      (o) => o.payment_status === 'paid' || o.payment_status === 'authorized'
    )
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

    return anomalies
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
