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

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts)
  const [hourlySales] = useState<HourlySalesPoint[]>(mockHourlySales)
  const [metricCards] = useState<MetricCardData[]>(mockMetricCards)
  const [aiInsights] = useState<AIInsight[]>(mockAIInsights)
  const [incidents] = useState<IncidentRecord[]>(mockIncidents)
  const [lastSync, setLastSync] = useState<Date>(new Date())
  const [isOnline, setIsOnline] = useState(true)

  const refreshAlerts = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/api/alerts?limit=20&status=open,investigating`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.alerts) && data.alerts.length > 0) {
          setAlerts(data.alerts)
        }
      }
      setLastSync(new Date())
      setIsOnline(true)
    } catch {
      setIsOnline(false)
    }
  }, [])

  useEffect(() => {
    // Try Supabase realtime if configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co') {
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

        return () => {
          supabase.removeChannel(channel)
        }
      })
    }

    // Poll backend every 30s as fallback
    const interval = setInterval(refreshAlerts, 30000)
    return () => clearInterval(interval)
  }, [refreshAlerts])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader lastSync={lastSync} isOnline={isOnline} />

      <main className="px-4 md:px-6 lg:px-8 pb-12 space-y-6 max-w-[1920px] mx-auto">
        {/* Metric Cards Grid */}
        <section>
          <MetricCards cards={metricCards} />
        </section>

        {/* Middle Row: Alert Feed + Sales Chart */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <AlertFeed alerts={alerts} />
          </div>
          <div className="lg:col-span-3">
            <SalesChart data={hourlySales} />
          </div>
        </section>

        {/* Bottom Row: AI Panel + Incident History */}
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
