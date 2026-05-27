'use client'

import { useEffect, useState, useCallback } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import MetricCards from '@/components/dashboard/MetricCards'
import AlertFeed from '@/components/dashboard/AlertFeed'
import SalesChart from '@/components/dashboard/SalesChart'
import AIPanel from '@/components/dashboard/AIPanel'
import IncidentHistory from '@/components/dashboard/IncidentHistory'
import { mockMetricCards } from '@/lib/mockData'
import { Alert, AIInsight, HourlySalesPoint, IncidentRecord, MetricCardData } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Cards com estrutura real mas sem nenhum valor inventado enquanto carrega
const PLACEHOLDER_CARDS: MetricCardData[] = mockMetricCards.map((c) => ({
  ...c,
  value: '—',
  rawValue: 0,
  change: 0,
  positive: true,
}))

// Gráfico vazio no formato da API (HH:00) — sem dados fake enquanto carrega
const EMPTY_HOURLY: HourlySalesPoint[] = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, '0')}:00`,
  today: 0,
  yesterday: 0,
}))

function computeIncidentDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms <= 0) return ''
  const totalMins = Math.round(ms / 60000)
  if (totalMins < 60) return `${totalMins}min`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [hourlySales, setHourlySales] = useState<HourlySalesPoint[]>(EMPTY_HOURLY)
  const [metricCards, setMetricCards] = useState<MetricCardData[]>(PLACEHOLDER_CARDS)
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([])
  const [incidents, setIncidents] = useState<IncidentRecord[]>([])
  const [lastSync, setLastSync] = useState<Date>(new Date())
  const [isOnline, setIsOnline] = useState(true)

  const refreshAll = useCallback(async () => {
    const [
      alertsData,
      metricsData,
      paymentsData,
      systemData,
      salesHistory,
      insightsData,
      incidentsData,
    ] = await Promise.all([
      apiFetch<{ alerts: Alert[] }>('/api/alerts?limit=20&status=open,investigating'),
      apiFetch<{ metrics: Record<string, number | string> }>('/api/metrics/sales'),
      apiFetch<{ metrics: Record<string, number> }>('/api/metrics/payments'),
      apiFetch<{ health: Array<{ service: string; status: string; uptime_percent: number }> }>('/api/metrics/system'),
      apiFetch<{ data: HourlySalesPoint[] }>('/api/metrics/sales?type=hourly'),
      apiFetch<{ insights: AIInsight[] }>('/api/ai/insights'),
      apiFetch<{ alerts: Alert[] }>('/api/alerts?limit=30&status=resolved,investigating'),
    ])

    // ── Alertas ────────────────────────────────────────────────────────────
    if (alertsData !== null) {
      setAlerts(alertsData.alerts ?? [])
    }

    // ── Métricas (cards) — inclui comparativos reais vs ontem ──────────────
    if (metricsData?.metrics) {
      const m = metricsData.metrics
      const n = (v: unknown) => Number(v ?? 0)
      setMetricCards((prev) =>
        prev.map((card) => {
          switch (card.id) {
            case 'revenue':
              return {
                ...card,
                value: `R$ ${n(m.revenue_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                rawValue: n(m.revenue_brl),
                change: n(m.revenue_change_pct),
                positive: n(m.revenue_change_pct) >= 0,
              }
            case 'orders':
              return {
                ...card,
                value: String(m.orders_count ?? '—'),
                rawValue: n(m.orders_count),
                change: n(m.orders_change_pct),
                positive: n(m.orders_change_pct) >= 0,
              }
            case 'ticket':
              return {
                ...card,
                value: `R$ ${n(m.avg_ticket_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                rawValue: n(m.avg_ticket_brl),
                change: n(m.avg_ticket_change_pct),
                positive: n(m.avg_ticket_change_pct) >= 0,
              }
            case 'pix_orders':
              return {
                ...card,
                value: String(m.pix_orders ?? '—'),
                rawValue: n(m.pix_orders),
                change: n(m.pix_change_pct),
                positive: n(m.pix_change_pct) >= 0,
              }
            case 'coupons':
              return {
                ...card,
                value: String(m.coupon_uses ?? '—'),
                rawValue: n(m.coupon_uses),
                change: n(m.coupon_change_pct),
                positive: n(m.coupon_change_pct) >= 0,
              }
            case 'conversion':
              return {
                ...card,
                value: `${n(m.conversion_rate).toFixed(1)}%`,
                rawValue: n(m.conversion_rate),
                change: n(m.conversion_change_pct),
                positive: n(m.conversion_change_pct) >= 0,
                changeLabel: 'vs ontem',
              }
            default:
              return card
          }
        })
      )
    }

    // ── Aprovação de cartão (Supabase fallback) ────────────────────────────
    if (paymentsData?.metrics) {
      const p = paymentsData.metrics
      setMetricCards((prev) =>
        prev.map((card) =>
          card.id === 'card_approval'
            ? { ...card, value: `${Number(p.card_approval_rate ?? 0).toFixed(1)}%`, rawValue: Number(p.card_approval_rate ?? 0) }
            : card
        )
      )
    }

    // ── Sistema (uptime + checkout) ────────────────────────────────────────
    if (systemData?.health) {
      const site = systemData.health.find((h) => h.service === 'site')
      const checkoutSvc = systemData.health.find((h) => h.service === 'checkout') ?? site
      if (site) {
        const siteStatus = site.status === 'online' ? 'online' : site.status === 'degraded' ? 'degraded' : 'offline'
        setMetricCards((prev) =>
          prev.map((card) => {
            if (card.id === 'uptime') {
              return {
                ...card,
                value: `${(site.uptime_percent ?? 100).toFixed(2)}%`,
                rawValue: site.uptime_percent ?? 100,
                status: siteStatus,
              }
            }
            if (card.id === 'checkout' && checkoutSvc) {
              const cs = checkoutSvc.status === 'online' ? 'online' : checkoutSvc.status === 'degraded' ? 'degraded' : 'offline'
              return {
                ...card,
                value: checkoutSvc.status === 'online' ? 'Operacional' : checkoutSvc.status === 'degraded' ? 'Degradado' : 'Offline',
                status: cs,
              }
            }
            return card
          })
        )
      }
    }

    // ── Gráfico de vendas por hora ─────────────────────────────────────────
    if (salesHistory?.data?.length) {
      setHourlySales(salesHistory.data)
    }

    // ── Insights de IA ────────────────────────────────────────────────────
    if (insightsData !== null) {
      setAIInsights(insightsData.insights ?? [])
    }

    // ── Histórico de incidentes ────────────────────────────────────────────
    if (incidentsData !== null) {
      setIncidents(
        (incidentsData.alerts ?? []).map((a): IncidentRecord => ({
          id: a.id,
          severity: a.severity,
          module: a.module,
          description: a.description,
          start_time: a.created_at,
          end_time: a.resolved_at,
          status:
            a.status === 'resolved' ? 'resolved'
            : a.status === 'investigating' ? 'investigating'
            : 'ongoing',
          duration: a.resolved_at
            ? computeIncidentDuration(a.created_at, a.resolved_at)
            : undefined,
        }))
      )
    }

    setLastSync(new Date())
    setIsOnline(true)
  }, [])

  // Supabase Realtime para alertas críticos em tempo real
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl && !supabaseUrl.includes('your-project')) {
      import('@/lib/supabase').then(({ default: supabase }) => {
        const channel = supabase
          .channel('alerts-realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'alerts' },
            (payload) => {
              const newAlert = payload.new as Alert
              setAlerts((prev) => [newAlert, ...prev.slice(0, 19)])
              setLastSync(new Date())
            }
          )
          .subscribe()
        return () => { supabase.removeChannel(channel) }
      })
    }
  }, [])

  // Polling completo a cada 30 segundos
  useEffect(() => {
    refreshAll()
    const interval = setInterval(refreshAll, 30_000)
    return () => clearInterval(interval)
  }, [refreshAll])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader lastSync={lastSync} isOnline={isOnline} />

      <main className="px-4 md:px-6 lg:px-8 pb-12 space-y-6 max-w-[1920px] mx-auto">
        <section>
          <MetricCards cards={metricCards} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:h-[480px]">
          <div className="h-[460px] lg:col-span-2 lg:h-full">
            <AlertFeed alerts={alerts} />
          </div>
          <div className="lg:col-span-3 lg:h-full">
            <SalesChart data={hourlySales} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:h-[480px]">
          <div className="h-[420px] lg:col-span-2 lg:h-full">
            <AIPanel insights={aiInsights} />
          </div>
          <div className="h-[500px] lg:col-span-3 lg:h-full">
            <IncidentHistory incidents={incidents} />
          </div>
        </section>
      </main>
    </div>
  )
}
