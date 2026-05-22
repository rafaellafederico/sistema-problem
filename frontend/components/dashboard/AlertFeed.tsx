'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, Filter, AlertTriangle, Info, Zap, CheckCircle2 } from 'lucide-react'
import { Alert, AlertSeverity } from '@/lib/types'
import SeverityBadge from '@/components/ui/SeverityBadge'
import { clsx } from 'clsx'

interface AlertFeedProps {
  alerts: Alert[]
}

type FilterType = 'all' | AlertSeverity

const severityOrder: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const severityIcons: Record<AlertSeverity, React.ComponentType<{ className?: string }>> = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: Info,
  low: CheckCircle2,
}

const severityBorderLeft: Record<AlertSeverity, string> = {
  critical: 'border-l-critical',
  high: 'border-l-high',
  medium: 'border-l-medium',
  low: 'border-l-low',
}

const severityBg: Record<AlertSeverity, string> = {
  critical: 'hover:bg-critical-bg/30',
  high: 'hover:bg-high-bg/50',
  medium: 'hover:bg-medium-bg/50',
  low: 'hover:bg-low-bg/50',
}

const sourceColors: Record<string, string> = {
  nuvemshop: 'text-blue-400',
  instagram: 'text-purple-400',
  monitoramento: 'text-cyan-400',
  whatsapp: 'text-green-400',
  default: 'text-text-tertiary',
}

function isNew(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 2 * 60 * 1000
}

interface AlertItemProps {
  alert: Alert
  isLatest: boolean
}

function AlertItem({ alert, isLatest }: AlertItemProps) {
  const IconComponent = severityIcons[alert.severity]
  const timeAgo = formatDistanceToNow(new Date(alert.created_at), {
    addSuffix: true,
    locale: ptBR,
  })
  const sourceColor = sourceColors[alert.source || 'default'] || sourceColors.default
  const alertIsNew = isNew(alert.created_at)

  return (
    <div
      className={clsx(
        'group relative flex gap-3 px-3 py-3 border-l-2 rounded-r-lg transition-all duration-200',
        'border-b border-border/40 last:border-b-0',
        severityBorderLeft[alert.severity],
        severityBg[alert.severity],
        isLatest && 'animate-slide-in-right',
        alert.severity === 'critical' && alert.status !== 'resolved' && 'animate-glow-critical'
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <IconComponent
          className={clsx(
            'w-4 h-4',
            alert.severity === 'critical' && 'text-critical',
            alert.severity === 'high' && 'text-high',
            alert.severity === 'medium' && 'text-medium',
            alert.severity === 'low' && 'text-low'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            <span className="text-xs text-text-tertiary font-medium">{alert.module}</span>
            {alertIsNew && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent border border-accent/30 tracking-widest">
                NOVO
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-tertiary font-mono flex-shrink-0 mt-0.5">
            {timeAgo}
          </span>
        </div>

        {/* Title */}
        <p className="text-xs font-semibold text-text-primary leading-snug mb-1">
          {alert.title}
        </p>

        {/* Description */}
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
          {alert.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className={clsx('text-[10px] font-mono uppercase tracking-wider', sourceColor)}>
            {alert.source || '—'}
          </span>
          <span
            className={clsx(
              'text-[10px] font-medium uppercase tracking-wider',
              alert.status === 'resolved' && 'text-low',
              alert.status === 'investigating' && 'text-medium',
              alert.status === 'open' && 'text-text-secondary',
              alert.status === 'false_positive' && 'text-text-tertiary'
            )}
          >
            {alert.status === 'open' && 'Aberto'}
            {alert.status === 'investigating' && 'Investigando'}
            {alert.status === 'resolved' && 'Resolvido'}
            {alert.status === 'false_positive' && 'Falso Positivo'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AlertFeed({ alerts }: AlertFeedProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [latestId, setLatestId] = useState<string | null>(null)
  const prevAlertsRef = useRef<Alert[]>(alerts)

  useEffect(() => {
    const prevIds = new Set(prevAlertsRef.current.map((a) => a.id))
    const newAlerts = alerts.filter((a) => !prevIds.has(a.id))
    if (newAlerts.length > 0) {
      setLatestId(newAlerts[0].id)
      setTimeout(() => setLatestId(null), 1000)
    }
    prevAlertsRef.current = alerts
  }, [alerts])

  const filteredAlerts = alerts
    .filter((a) => filter === 'all' || a.severity === filter)
    .sort((a, b) => {
      if (a.status === 'resolved' && b.status !== 'resolved') return 1
      if (b.status === 'resolved' && a.status !== 'resolved') return -1
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (severityDiff !== 0) return severityDiff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
    low: alerts.filter((a) => a.severity === 'low').length,
  }

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.all },
    { key: 'critical', label: 'Crítico', count: counts.critical },
    { key: 'high', label: 'Alto', count: counts.high },
    { key: 'medium', label: 'Médio', count: counts.medium },
    { key: 'low', label: 'Baixo', count: counts.low },
  ]

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Feed de Alertas</span>
          {counts.critical > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-critical text-white text-[10px] font-bold">
              {counts.critical}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-text-tertiary" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-shrink-0 overflow-x-auto">
        {filterButtons.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap',
              filter === key
                ? 'bg-surface-3 text-text-primary border border-border-2'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            )}
          >
            {label}
            {count > 0 && (
              <span
                className={clsx(
                  'text-[10px] font-bold',
                  key === 'critical' && count > 0 ? 'text-critical' : 'text-text-tertiary'
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-tertiary py-12">
            <Zap className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum alerta {filter !== 'all' ? `"${filter}"` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-transparent">
            {filteredAlerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                isLatest={alert.id === latestId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border flex-shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">
          {filteredAlerts.length} alertas exibidos
        </span>
        <span className="text-[10px] text-text-tertiary font-mono">
          Realtime ativo
        </span>
      </div>
    </div>
  )
}
