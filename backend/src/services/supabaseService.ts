import supabase from '../config/database'

export interface AlertRecord {
  id?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  module: string
  title: string
  description: string
  source?: string
  metadata?: Record<string, unknown>
  status?: 'open' | 'investigating' | 'resolved' | 'false_positive'
  notified_whatsapp?: boolean
  created_at?: string
  resolved_at?: string
}

export interface AlertFilters {
  severity?: string
  status?: string
  limit?: number
  offset?: number
}

export interface SalesMetricRecord {
  snapshot_at?: string
  revenue_brl: number
  orders_count: number
  avg_ticket_brl: number
  conversion_rate: number
  pix_orders: number
  card_orders: number
  boleto_orders?: number
  coupon_uses?: number
  abandoned_carts?: number
  checkout_sessions?: number
}

export interface ComplaintRecord {
  source: 'instagram_dm' | 'instagram_comment' | 'email' | 'whatsapp' | 'site'
  content: string
  customer_identifier?: string
  severity?: 'critical' | 'high' | 'medium' | 'low'
  category?: string
  keywords?: string[]
}

export interface AnomalyRecord {
  anomaly_type: string
  module: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  metric_value?: number
  baseline_value?: number
  deviation_percent?: number
  ai_analysis?: string
}

export interface SystemHealthRecord {
  service: string
  status: 'online' | 'degraded' | 'offline'
  response_time_ms?: number
  status_code?: number
  error_message?: string
  uptime_percent?: number
}

class SupabaseService {
  async saveAlert(alert: AlertRecord): Promise<AlertRecord | null> {
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        ...alert,
        status: alert.status || 'open',
        notified_whatsapp: alert.notified_whatsapp || false,
      })
      .select()
      .single()

    if (error) {
      console.error('[SupabaseService] Error saving alert:', error)
      return null
    }
    return data
  }

  async getAlerts(filters: AlertFilters = {}): Promise<AlertRecord[]> {
    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.severity) {
      const severities = filters.severity.split(',').map((s) => s.trim())
      query = query.in('severity', severities)
    }

    if (filters.status) {
      const statuses = filters.status.split(',').map((s) => s.trim())
      query = query.in('status', statuses)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    } else {
      query = query.limit(50)
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
    }

    const { data, error } = await query

    if (error) {
      console.error('[SupabaseService] Error fetching alerts:', error)
      return []
    }
    return data || []
  }

  async updateAlertStatus(
    id: string,
    status: 'open' | 'investigating' | 'resolved' | 'false_positive',
    resolvedAt?: string
  ): Promise<boolean> {
    const updateData: Record<string, unknown> = { status }
    if (status === 'resolved') {
      updateData.resolved_at = resolvedAt || new Date().toISOString()
    }

    const { error } = await supabase.from('alerts').update(updateData).eq('id', id)

    if (error) {
      console.error('[SupabaseService] Error updating alert:', error)
      return false
    }
    return true
  }

  async getAlertSummary(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('alerts').select('severity, status')

    if (error || !data) return { critical: 0, high: 0, medium: 0, low: 0 }

    return data.reduce(
      (acc, row) => {
        if (row.status !== 'resolved' && row.status !== 'false_positive') {
          acc[row.severity] = (acc[row.severity] || 0) + 1
        }
        return acc
      },
      {} as Record<string, number>
    )
  }

  async saveSalesMetric(metric: SalesMetricRecord): Promise<SalesMetricRecord | null> {
    const { data, error } = await supabase
      .from('sales_metrics')
      .insert(metric)
      .select()
      .single()

    if (error) {
      console.error('[SupabaseService] Error saving sales metric:', error)
      return null
    }
    return data
  }

  async getSalesHistory(hours: number = 24): Promise<SalesMetricRecord[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('sales_metrics')
      .select('*')
      .gte('snapshot_at', since)
      .order('snapshot_at', { ascending: true })

    if (error) {
      console.error('[SupabaseService] Error fetching sales history:', error)
      return []
    }
    return data || []
  }

  async saveComplaint(complaint: ComplaintRecord): Promise<ComplaintRecord | null> {
    const { data, error } = await supabase
      .from('complaints')
      .insert(complaint)
      .select()
      .single()

    if (error) {
      console.error('[SupabaseService] Error saving complaint:', error)
      return null
    }
    return data
  }

  async getSystemHealth(): Promise<SystemHealthRecord[]> {
    // Get latest status per service
    const { data, error } = await supabase
      .from('system_health')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[SupabaseService] Error fetching system health:', error)
      return []
    }

    // Deduplicate by service (keep most recent per service)
    const seen = new Set<string>()
    return (data || []).filter((row) => {
      if (seen.has(row.service)) return false
      seen.add(row.service)
      return true
    })
  }

  async saveSystemHealth(record: SystemHealthRecord): Promise<boolean> {
    const { error } = await supabase.from('system_health').insert(record)
    if (error) {
      console.error('[SupabaseService] Error saving system health:', error)
      return false
    }
    return true
  }

  async saveAnomalyLog(log: AnomalyRecord): Promise<boolean> {
    const { error } = await supabase.from('anomaly_logs').insert(log)
    if (error) {
      console.error('[SupabaseService] Error saving anomaly log:', error)
      return false
    }
    return true
  }

  async saveAIInsight(insight: {
    insight_type: string
    title: string
    summary: string
    confidence: number
    severity?: string
    related_alert_ids?: string[]
    raw_data?: Record<string, unknown>
    expires_at?: string
  }): Promise<boolean> {
    const { error } = await supabase.from('ai_insights').insert(insight)
    if (error) {
      console.error('[SupabaseService] Error saving AI insight:', error)
      return false
    }
    return true
  }

  async getAIInsights(limit: number = 5): Promise<unknown[]> {
    const { data, error } = await supabase
      .from('ai_insights')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[SupabaseService] Error fetching AI insights:', error)
      return []
    }
    return data || []
  }

  async markAlertNotified(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('alerts')
      .update({ notified_whatsapp: true })
      .eq('id', id)

    if (error) {
      console.error('[SupabaseService] Error marking alert notified:', error)
      return false
    }
    return true
  }
}

export const supabaseService = new SupabaseService()
export default supabaseService
