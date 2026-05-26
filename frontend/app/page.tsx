'use client'

import { useEffect, useState, useCallback } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import MetricCards from '@/components/dashboard/MetricCards'
import AlertFeed from '@/components/dashboard/AlertFeed'
import SalesChart from '@/components/dashboard/SalesChart'
import AIPanel from '@/components/dashboard/AIPanel'
import IncidentHistory from '@/components/dashboard/IncidentHistory'
import {
  mockAlerts,
  mockHourlySales,
  mockMetricCards,
  mockAIInsights,
  mockIncidents,
} from '@/lib/mockData'
import { Alert, AIInsight, AlertSeverity, HourlySalesPoint, IncidentRecord, MetricCardData } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts)
  const [hourlySales, setHourlySales] = useState<HourlySalesPoint[]>(mockHourlySales)
  const [metricCards, setMetricCards] = useState<MetricCardData[]>(mockMetricCards)
  const [aiInsights, setAIInsights] = useState<AIInsight[]>(mockAIInsights)
  const [incidents, setIncidents] = useState<IncidentRecord[]>(mockIncidents)
  const [lastSync, setLastSync] = useState<Date>(new Date())
  const [isOnline, setIsOnline] = useState(true)
  const [usingMock, setUsingMock] = useState(true)

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
      apiFetch<{ alerts: Alert[] }>('/api/alerts?limit=10&status=resolved,investigating,open'),
    ])

    // ── Alertas ────────────────────────────────────────────────────────────
    // Clear mock as soon as API responds — even an empty list is real data
    if (alertsData !== null) {
      setAlerts(alertsData.alerts ?? [])
      setUsingMock(false)
    }

    // ── Métricas (cards) ───────────────────────────────────────────────────
    if (metricsData?.metrics) {
      const m = metricsData.metrics
      setUsingMock(false)
      setMetricCards((prev) =>
        prev.map((card) => {
          switch (card.id) {
            case 'revenue':
              return { ...card, value: `R$ ${Number(m.revenue_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
            case 'orders':
              return { ...card, value: String(m.orders_count ?? card.value) }
            case 'avg_ticket':
              return { ...card, value: `R$ ${Number(m.avg_ticket_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
            case 'pix':
              return { ...card, value: String(m.pix_orders ?? card.value) }
            case 'coupons':
              return { ...card, value: String(m.coupon_uses ?? card.value) }
            default:
              return card
          }
        })
      )
    }

    // ── Pagamentos ─────────────────────────────────────────────────────────
    if (paymentsData?.metrics) {
      const p = paymentsData.metrics
      setMetricCards((prev) =>
        prev.map((card) =>
          card.id === 'card_approval'
            ? { ...card, value: `${Number(p.card_approval_rate ?? card.value).toFixed(1)}%` }
            : card
        )
      )
    }

    // ── Sistema (uptime) ───────────────────────────────────────────────────
    if (systemData?.health) {
      const site = systemData.health.find((h) => h.service === 'site')
      if (site) {
        setMetricCards((prev) =>
          prev.map((card) =>
            card.id === 'uptime'
              ? {
                  ...card,
                  value: `${(site.uptime_percent ?? 100).toFixed(2)}%`,
                  status: site.status === 'online' ? 'online' : site.status === 'degraded' ? 'degraded' : 'offline',
                }
              : card
          )
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
    // API returns Alert[] — map to IncidentRecord (field names differ)
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

      {usingMock && (
        <div className="bg-medium-bg border-b border-medium/20 px-4 py-2 text-center">
          <span className="text-xs text-medium font-medium">
            Exibindo dados de demonstração — backend não respondeu ou ainda sem dados reais
          </span>
        </div>
      )}

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
