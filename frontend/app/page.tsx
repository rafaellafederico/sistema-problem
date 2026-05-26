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
import { Alert, AIInsight, HourlySalesPoint, IncidentRecord, MetricCardData } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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
    // ── Alertas ────────────────────────────────────────────────────────────
    const alertsData = await apiFetch<{ alerts: Alert[] }>(
      '/api/alerts?limit=20&status=open,investigating'
    )
    if (alertsData?.alerts?.length) {
      setAlerts(alertsData.alerts)
      setUsingMock(false)
    }

    // ── Métricas (cards) ───────────────────────────────────────────────────
    const metricsData = await apiFetch<{ metrics: Record<string, number | string> }>(
      '/api/metrics/sales'
    )
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
    const paymentsData = await apiFetch<{ metrics: Record<string, number> }>(
      '/api/metrics/payments'
    )
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
    const systemData = await apiFetch<{ health: Array<{ service: string; status: string; uptime_percent: number }> }>(
      '/api/metrics/system'
    )
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
    const salesHistory = await apiFetch<{ data: HourlySalesPoint[] }>(
      '/api/metrics/sales?type=hourly'
    )
    if (salesHistory?.data?.length) {
      setHourlySales(salesHistory.data)
    }

    // ── Insights de IA ────────────────────────────────────────────────────
    const insightsData = await apiFetch<{ insights: AIInsight[] }>('/api/ai/insights')
    if (insightsData?.insights?.length) {
      setAIInsights(insightsData.insights)
    }

    // ── Histórico de incidentes ────────────────────────────────────────────
    const incidentsData = await apiFetch<{ alerts: IncidentRecord[] }>(
      '/api/alerts?limit=10&status=resolved,investigating,open'
    )
    if (incidentsData?.alerts?.length) {
      setIncidents(incidentsData.alerts as unknown as IncidentRecord[])
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

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <AlertFeed alerts={alerts} />
          </div>
          <div className="lg:col-span-3">
            <SalesChart data={hourlySales} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <AIPanel insights={aiInsights} />
          </div>
          <div className="lg:col-span-3">
            <IncidentHistory incidents={incidents} />
          </div>
        </section>
      </main>
    </div>
  )
}
