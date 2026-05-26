'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
  TooltipProps,
} from 'recharts'
import { TrendingUp, BarChart3 } from 'lucide-react'
import { HourlySalesPoint } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface SalesChartProps {
  data: HourlySalesPoint[]
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatBRLShort(value: number): string {
  if (value >= 1000) {
    return `R$${(value / 1000).toFixed(1)}k`
  }
  return formatBRL(value)
}

interface CustomTooltipProps extends TooltipProps<number, string> {}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const today = payload.find((p) => p.dataKey === 'today')
  const yesterday = payload.find((p) => p.dataKey === 'yesterday')

  const diff =
    today && yesterday && typeof today.value === 'number' && typeof yesterday.value === 'number'
      ? ((today.value - yesterday.value) / (yesterday.value || 1)) * 100
      : null

  return (
    <div className="rounded-xl border border-border-2 bg-surface-2 shadow-xl p-3 min-w-[180px]">
      <p className="text-xs text-text-secondary font-medium mb-2 uppercase tracking-wider">
        {label}
      </p>
      {today && typeof today.value === 'number' && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" />
            Hoje
          </span>
          <span className="text-xs font-bold text-text-primary tabular-nums">
            {formatBRL(today.value)}
          </span>
        </div>
      )}
      {yesterday && typeof yesterday.value === 'number' && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-text-tertiary inline-block" />
            Ontem
          </span>
          <span className="text-xs font-semibold text-text-secondary tabular-nums">
            {formatBRL(yesterday.value)}
          </span>
        </div>
      )}
      {diff !== null && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <span
            className={`text-xs font-semibold tabular-nums ${
              diff >= 0 ? 'text-low' : 'text-critical'
            }`}
          >
            {diff >= 0 ? '+' : ''}
            {diff.toFixed(1)}% vs ontem
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
  const todayTotal = data.reduce((sum, d) => sum + d.today, 0)
  const yesterdayTotal = data.reduce((sum, d) => sum + d.yesterday, 0)
  const changePercent = yesterdayTotal > 0
    ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100
    : 0

  const currentHour = new Date().getHours()
  const slicedData = data.slice(0, currentHour + 1)

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Faturamento por Hora</span>
          <span className="text-xs text-text-tertiary">— últimas 24h</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-text-primary tabular-nums">
              {formatBRL(todayTotal)}
            </span>
            <span
              className={`text-[10px] font-semibold tabular-nums ${
                changePercent >= 0 ? 'text-low' : 'text-critical'
              }`}
            >
              {changePercent >= 0 ? '+' : ''}
              {changePercent.toFixed(1)}% vs ontem
            </span>
          </div>
          <TrendingUp
            className={`w-4 h-4 ${changePercent >= 0 ? 'text-low' : 'text-critical'}`}
          />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4 min-h-0">
        <div className="flex justify-end mb-3">
          <CustomLegend />
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={slicedData}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            role="img"
            aria-label={`Gráfico de faturamento por hora. Hoje: ${formatBRL(todayTotal)}${yesterdayTotal > 0 ? `, variação de ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% vs ontem` : ''}`}
          >
            <defs>
              <linearGradient id="gradientToday" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f5e6d0" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f5e6d0" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientYesterday" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#555555" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#555555" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e1e1e"
              vertical={false}
            />

            <XAxis
              dataKey="hour"
              tick={{ fill: '#555555', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: '#1e1e1e' }}
              interval={2}
            />

            <YAxis
              tickFormatter={formatBRLShort}
              tick={{ fill: '#555555', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#333333', strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="yesterday"
              stroke="#444444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#gradientYesterday)"
              dot={false}
              activeDot={{ r: 4, fill: '#888888', strokeWidth: 0 }}
            />

            <Area
              type="monotone"
              dataKey="today"
              stroke="#f5e6d0"
              strokeWidth={2}
              fill="url(#gradientToday)"
              dot={false}
              activeDot={{ r: 5, fill: '#f5e6d0', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
