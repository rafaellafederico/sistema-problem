'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
  TooltipProps,
} from 'recharts'
import { TrendingUp, BarChart3 } from 'lucide-react'
import { HourlySalesPoint } from '@/lib/types'
import { clsx } from 'clsx'

interface SalesChartProps {
  data: HourlySalesPoint[]
}

type ViewMode = 'revenue' | 'orders'

const C = {
  accent: '#f5e6d0',
  textTertiary: '#555555',
  border: '#1e1e1e',
  borderMid: '#333333',
  yesterday: '#444444',
  yesterdayDot: '#888888',
} as const

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatBRLShort(value: number): string {
  if (value >= 1000) return `R$${(value / 1000).toFixed(1)}k`
  return formatBRL(value)
}

function CustomTooltip({
  active,
  payload,
  label,
  mode,
}: TooltipProps<number, string> & { mode: ViewMode }) {
  if (!active || !payload || !payload.length) return null

  const todayKey = mode === 'revenue' ? 'today' : 'orders_today'
  const yesterdayKey = mode === 'revenue' ? 'yesterday' : 'orders_yesterday'

  const todayEntry = payload.find((p) => p.dataKey === todayKey)
  const yesterdayEntry = payload.find((p) => p.dataKey === yesterdayKey)

  const todayVal = typeof todayEntry?.value === 'number' ? todayEntry.value : null
  const yesterdayVal = typeof yesterdayEntry?.value === 'number' ? yesterdayEntry.value : null

  const diff =
    todayVal !== null && yesterdayVal !== null && yesterdayVal > 0
      ? ((todayVal - yesterdayVal) / yesterdayVal) * 100
      : null

  const fmt = (v: number) =>
    mode === 'revenue' ? formatBRL(v) : `${v} pedido${v !== 1 ? 's' : ''}`

  return (
    <div className="rounded-xl border border-border-2 bg-surface-2 shadow-xl p-3 min-w-[180px]">
      <p className="text-xs text-text-secondary font-medium mb-2 uppercase tracking-wider">
        {label}
      </p>
      {todayVal !== null && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" />
            Hoje
          </span>
          <span className="text-xs font-bold text-text-primary tabular-nums">
            {fmt(todayVal)}
          </span>
        </div>
      )}
      {yesterdayVal !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-text-tertiary inline-block" />
            Ontem
          </span>
          <span className="text-xs font-semibold text-text-secondary tabular-nums">
            {fmt(yesterdayVal)}
          </span>
        </div>
      )}
      {diff !== null && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <span className={`text-xs font-semibold tabular-nums ${diff >= 0 ? 'text-low' : 'text-critical'}`}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs ontem
          </span>
        </div>
      )}
    </div>
  )
}

function CustomLegend() {
  return (
    <div className="flex items-center gap-4 justify-end px-2">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-0.5 bg-accent rounded" />
        <span className="text-xs text-text-secondary">Hoje</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-0.5 bg-text-tertiary rounded border-dashed border border-text-tertiary" />
        <span className="text-xs text-text-secondary">Ontem</span>
      </div>
    </div>
  )
}

export default function SalesChart({ data }: SalesChartProps) {
  const [mode, setMode] = useState<ViewMode>('revenue')

  const todayKey = mode === 'revenue' ? 'today' : 'orders_today'
  const yesterdayKey = mode === 'revenue' ? 'yesterday' : 'orders_yesterday'

  const todayTotal = data.reduce((sum, d) => sum + (d[todayKey] ?? 0), 0)
  const yesterdayTotal = data.reduce((sum, d) => sum + (d[yesterdayKey] ?? 0), 0)
  const changePercent = yesterdayTotal > 0
    ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100
    : 0

  const currentHour = new Date().getHours()
  const slicedData = data.slice(0, currentHour + 1)

  const yFormatter = mode === 'revenue'
    ? formatBRLShort
    : (v: number) => String(v)

  const totalLabel = mode === 'revenue'
    ? formatBRL(todayTotal)
    : `${todayTotal} pedidos`

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">
              {mode === 'revenue' ? 'Faturamento' : 'Pedidos'} por Hora
            </span>
            <span className="text-xs text-text-tertiary">— hoje vs ontem</span>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-surface-3 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setMode('revenue')}
              className={clsx(
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all',
                mode === 'revenue'
                  ? 'bg-surface text-text-primary border border-border-2 shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              R$
            </button>
            <button
              onClick={() => setMode('orders')}
              className={clsx(
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all',
                mode === 'orders'
                  ? 'bg-surface text-text-primary border border-border-2 shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              Qtd
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-text-primary tabular-nums">
              {totalLabel}
            </span>
            <span className={`text-[10px] font-semibold tabular-nums ${changePercent >= 0 ? 'text-low' : 'text-critical'}`}>
              {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}% vs ontem
            </span>
          </div>
          <TrendingUp className={`w-4 h-4 ${changePercent >= 0 ? 'text-low' : 'text-critical'}`} />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4 min-h-[220px]">
        <div className="flex justify-end mb-3">
          <CustomLegend />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={slicedData}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            role="img"
            aria-label={`Gráfico de ${mode === 'revenue' ? 'faturamento' : 'pedidos'} por hora. Hoje: ${totalLabel}`}
          >
            <defs>
              <linearGradient id="gradientToday" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.accent} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientYesterday" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.textTertiary} stopOpacity={0.12} />
                <stop offset="95%" stopColor={C.textTertiary} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />

            <XAxis
              dataKey="hour"
              tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              interval={2}
            />

            <YAxis
              tickFormatter={yFormatter}
              tick={{ fill: C.textTertiary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />

            <Tooltip
              content={(props) => <CustomTooltip {...(props as TooltipProps<number, string>)} mode={mode} />}
              cursor={{ stroke: C.borderMid, strokeWidth: 1 }}
            />

            <Area
              type="monotone"
              dataKey={yesterdayKey}
              stroke={C.yesterday}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#gradientYesterday)"
              dot={false}
              activeDot={{ r: 4, fill: C.yesterdayDot, strokeWidth: 0 }}
            />

            <Area
              type="monotone"
              dataKey={todayKey}
              stroke={C.accent}
              strokeWidth={2}
              fill="url(#gradientToday)"
              dot={false}
              activeDot={{ r: 5, fill: C.accent, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
