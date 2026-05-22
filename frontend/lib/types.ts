export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'false_positive'

export interface Alert {
  id: string
  severity: AlertSeverity
  module: string
  title: string
  description: string
  source?: string
  metadata?: Record<string, unknown>
  status: AlertStatus
  created_at: string
  resolved_at?: string
  notified_whatsapp?: boolean
}

export interface SalesMetric {
  id: string
  snapshot_at: string
  revenue_brl: number
  orders_count: number
  avg_ticket_brl: number
  conversion_rate: number
  pix_orders: number
  card_orders: number
  boleto_orders: number
  coupon_uses: number
  abandoned_carts: number
  checkout_sessions: number
}

export interface PaymentMetric {
  id: string
  snapshot_at: string
  card_approval_rate: number
  pix_approval_rate: number
  total_transactions: number
  failed_transactions: number
  refunds_count: number
  refunds_amount_brl: number
}

export interface Complaint {
  id: string
  source: 'instagram_dm' | 'instagram_comment' | 'email' | 'whatsapp' | 'site'
  content: string
  customer_identifier?: string
  severity?: AlertSeverity
  category?: string
  keywords?: string[]
  detected_at: string
  grouped_with?: string[]
  pattern_id?: string
  resolved: boolean
}

export interface AnomalyLog {
  id: string
  anomaly_type: string
  module: string
  description: string
  severity: AlertSeverity
  metric_value?: number
  baseline_value?: number
  deviation_percent?: number
  detected_at: string
  resolved_at?: string
  false_positive: boolean
  ai_analysis?: string
}

export interface SystemHealth {
  id: string
  service: string
  status: 'online' | 'degraded' | 'offline'
  response_time_ms?: number
  status_code?: number
  error_message?: string
  checked_at: string
  uptime_percent?: number
}

export interface AIInsight {
  id: string
  insight_type: string
  title: string
  summary: string
  confidence: number
  severity?: AlertSeverity
  related_alert_ids?: string[]
  raw_data?: Record<string, unknown>
  created_at: string
  expires_at?: string
}

export interface MetricCardData {
  id: string
  label: string
  value: string
  rawValue: number
  change: number
  changeLabel: string
  positive: boolean
  icon: string
  status?: 'online' | 'degraded' | 'offline'
}

export interface HourlySalesPoint {
  hour: string
  today: number
  yesterday: number
}

export interface IncidentRecord {
  id: string
  severity: AlertSeverity
  module: string
  description: string
  start_time: string
  end_time?: string
  status: 'resolved' | 'ongoing' | 'investigating'
  duration?: string
}

export interface DashboardData {
  alerts: Alert[]
  salesMetrics: SalesMetric[]
  paymentMetric: PaymentMetric
  systemHealth: SystemHealth[]
  aiInsights: AIInsight[]
  metricCards: MetricCardData[]
  hourlySales: HourlySalesPoint[]
  incidents: IncidentRecord[]
}
