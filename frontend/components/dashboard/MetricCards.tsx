'use client'

import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  CreditCard,
  Zap,
  Tag,
  BarChart2,
  CheckCircle,
  XCircle,
  Wifi,
  TrendingDown,
  Info,
} from 'lucide-react'
import { MetricCardData } from '@/lib/types'
import StatusDot from '@/components/ui/StatusDot'
import { clsx } from 'clsx'

interface MetricCardsProps {
  cards: MetricCardData[]
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  CreditCard,
  Zap,
  Tag,
  BarChart2,
  CheckCircle,
  XCircle,
  Wifi,
}

function MetricCard({ card }: { card: MetricCardData }) {
  const IconComponent = iconMap[card.icon] || DollarSign
  const isNegative = !card.positive && card.change !== 0
  const isPositive = card.positive && card.change !== 0

  const changeColor = isNegative
    ? 'text-critical'
    : isPositive
    ? 'text-low'
    : 'text-text-secondary'

  const cardBorderColor = isNegative
    ? 'border-critical/20'
    : 'border-border hover:border-border-2'

  const iconBg = isNegative
    ? 'bg-critical-bg text-critical'
    : card.id === 'uptime' || card.id === 'checkout'
    ? 'bg-low-bg text-low'
    : 'bg-surface-3 text-accent'

  return (
    <div
      className={clsx(
        'relative flex flex-col gap-3 p-4 rounded-xl border bg-surface transition-ui',
        'hover:bg-surface-2 cursor-default group',
        cardBorderColor,
        isNegative && 'animate-glow-critical'
      )}
    >
      {/* Header: Icon + Status */}
      <div className="flex items-start justify-between">
        <div className={clsx('flex items-center justify-center w-9 h-9 rounded-lg', iconBg)}>
          <IconComponent className="w-4 h-4" />
        </div>

        {card.status && (
          <StatusDot status={card.status} />
        )}

        {!card.status && isNegative && (
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-critical" />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className={clsx(
            'text-xl 2xl:text-lg font-bold tabular-nums tracking-tight leading-none truncate',
            isNegative ? 'text-white' : 'text-text-primary'
          )}
          title={card.value}
        >
          {card.value}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider truncate">
            {card.label}
          </span>
          {card.tooltip && (
            <div className="relative flex-shrink-0 group/tip">
              <Info className="w-3 h-3 text-text-tertiary hover:text-text-secondary cursor-help transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-lg bg-surface-3 border border-border-2 shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
                <p className="text-[11px] text-text-secondary leading-relaxed normal-case tracking-normal font-normal">
                  {card.tooltip}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change Indicator */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
        <span className={clsx('text-xs font-semibold tabular-nums', changeColor)}>
          {card.change > 0 ? '+' : ''}
          {card.change !== 0 ? `${card.change}%` : '—'}
        </span>
        {card.change !== 0 && card.changeLabel && (
          <span className="text-xs text-text-tertiary">{card.changeLabel}</span>
        )}
      </div>

      {/* Critical Indicator Bar */}
      {isNegative && Math.abs(card.change) > 15 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-critical/60" />
      )}
    </div>
  )
}

export default function MetricCards({ cards }: MetricCardsProps) {
  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest">
          Métricas em Tempo Real
        </h2>
        <span className="text-xs text-text-tertiary font-mono">
          Atualização: 30s
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9 gap-3 min-w-0">
        {cards.map((card) => (
          <MetricCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}
