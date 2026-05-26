'use client'

import { useState } from 'react'
import { Clock, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, History } from 'lucide-react'
import { IncidentRecord, AlertSeverity } from '@/lib/types'
import SeverityBadge from '@/components/ui/SeverityBadge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { clsx } from 'clsx'

interface IncidentHistoryProps {
  incidents: IncidentRecord[]
}

type SortField = 'severity' | 'module' | 'start_time' | 'status'
type SortDir = 'asc' | 'desc'

const severityOrder: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  resolved: {
    label: 'Resolvido',
    classes: 'bg-low-bg text-low border-low/20',
  },
  ongoing: {
    label: 'Em Andamento',
    classes: 'bg-critical-bg text-critical border-critical/20 animate-pulse',
  },
  investigating: {
    label: 'Investigando',
    classes: 'bg-medium-bg text-medium border-medium/20',
  },
}

function SortIcon({
  field,
  currentField,
  direction,
}: {
  field: SortField
  currentField: SortField
  direction: SortDir
}) {
  if (field !== currentField) {
    return <ChevronsUpDown className="w-3 h-3 text-text-tertiary" />
  }
  return direction === 'asc' ? (
    <ChevronUp className="w-3 h-3 text-accent" />
  ) : (
    <ChevronDown className="w-3 h-3 text-accent" />
  )
}

const ITEMS_PER_PAGE = 10

export default function IncidentHistory({ incidents }: IncidentHistoryProps) {
  const [sortField, setSortField] = useState<SortField>('start_time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  const sorted = [...incidents].sort((a, b) => {
    let diff = 0
    if (sortField === 'severity') {
      diff = severityOrder[a.severity] - severityOrder[b.severity]
    } else if (sortField === 'module') {
      diff = a.module.localeCompare(b.module)
    } else if (sortField === 'start_time') {
      diff = new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    } else if (sortField === 'status') {
      const statusOrder: Record<string, number> = { ongoing: 0, investigating: 1, resolved: 2 }
      diff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
    }
    return sortDir === 'asc' ? diff : -diff
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE))
  const paginated = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const activeCount = incidents.filter(
    (i) => i.status === 'ongoing' || i.status === 'investigating'
  ).length

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Histórico de Incidentes</span>
          {activeCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-critical-bg border border-critical/20 text-critical text-[10px] font-bold">
              <AlertTriangle className="w-2.5 h-2.5" />
              {activeCount} ativos
            </span>
          )}
        </div>
        <span className="text-xs text-text-tertiary">
          {incidents.length} incidentes
        </span>
      </div>

      {/* Mobile card list (hidden on md+) */}
      <div className="md:hidden flex-1 overflow-y-auto min-h-0 divide-y divide-border/40">
        {paginated.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">
            Nenhum incidente registrado
          </div>
        ) : (
          paginated.map((incident) => {
            const statusCfg = statusConfig[incident.status] || statusConfig.resolved
            const startDate = new Date(incident.start_time)
            const startFormatted = format(startDate, 'dd/MM HH:mm', { locale: ptBR })
            const timeAgo = formatDistanceToNow(startDate, { addSuffix: true, locale: ptBR })

            return (
              <div key={incident.id} className="px-4 py-3 space-y-2">
                {/* Top row: severity + module + status */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={incident.severity} />
                    <span className="text-xs font-medium text-text-primary">{incident.module}</span>
                  </div>
                  <span
                    className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border',
                      statusCfg.classes
                    )}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                  {incident.description}
                </p>

                {/* Time row */}
                <div className="flex items-center gap-3 text-[11px] text-text-tertiary font-mono">
                  <span>{startFormatted}</span>
                  <span className="opacity-50">·</span>
                  <span>{timeAgo}</span>
                  {incident.end_time && incident.duration && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {incident.duration}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Desktop table (hidden below md) */}
      <div className="hidden md:block flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs" aria-label="Histórico de incidentes operacionais">
          <thead className="sticky top-0 bg-surface-2 z-10">
            <tr className="border-b border-border">
              <th
                className="px-4 py-2.5 text-left"
                aria-sort={sortField === 'severity' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  className="flex items-center gap-1 text-text-secondary font-semibold uppercase tracking-wider hover:text-text-primary transition-colors"
                  onClick={() => handleSort('severity')}
                >
                  Severidade
                  <SortIcon field="severity" currentField={sortField} direction={sortDir} />
                </button>
              </th>
              <th
                className="px-4 py-2.5 text-left"
                aria-sort={sortField === 'module' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  className="flex items-center gap-1 text-text-secondary font-semibold uppercase tracking-wider hover:text-text-primary transition-colors"
                  onClick={() => handleSort('module')}
                >
                  Módulo
                  <SortIcon field="module" currentField={sortField} direction={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-left text-text-secondary font-semibold uppercase tracking-wider">
                Descrição
              </th>
              <th
                className="px-4 py-2.5 text-left"
                aria-sort={sortField === 'start_time' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  className="flex items-center gap-1 text-text-secondary font-semibold uppercase tracking-wider hover:text-text-primary transition-colors"
                  onClick={() => handleSort('start_time')}
                >
                  Início
                  <SortIcon field="start_time" currentField={sortField} direction={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-left text-text-secondary font-semibold uppercase tracking-wider">
                Resolução
              </th>
              <th
                className="px-4 py-2.5 text-left"
                aria-sort={sortField === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  className="flex items-center gap-1 text-text-secondary font-semibold uppercase tracking-wider hover:text-text-primary transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status
                  <SortIcon field="status" currentField={sortField} direction={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((incident, idx) => {
              const statusCfg = statusConfig[incident.status] || statusConfig.resolved
              const startDate = new Date(incident.start_time)
              const startFormatted = format(startDate, 'dd/MM HH:mm', { locale: ptBR })
              const timeAgo = formatDistanceToNow(startDate, { addSuffix: true, locale: ptBR })

              return (
                <tr
                  key={incident.id}
                  className={clsx(
                    'border-b border-border/40 transition-colors hover:bg-surface-2',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-surface-3/30'
                  )}
                >
                  {/* Severity */}
                  <td className="px-4 py-3">
                    <SeverityBadge severity={incident.severity} />
                  </td>

                  {/* Module */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-text-primary whitespace-nowrap">
                      {incident.module}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 max-w-xs">
                    <span className="text-text-secondary leading-relaxed line-clamp-2">
                      {incident.description}
                    </span>
                  </td>

                  {/* Start Time */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-text-primary">{startFormatted}</span>
                      <span className="text-text-tertiary text-[10px]">{timeAgo}</span>
                    </div>
                  </td>

                  {/* Resolution */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {incident.end_time ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-text-secondary">
                          {format(new Date(incident.end_time), 'HH:mm', { locale: ptBR })}
                        </span>
                        {incident.duration && (
                          <span className="text-text-tertiary text-[10px] flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {incident.duration}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-tertiary italic">Em aberto</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border',
                        statusCfg.classes
                      )}
                    >
                      {statusCfg.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {paginated.length === 0 && (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">
            Nenhum incidente registrado
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border flex-shrink-0">
          <span className="text-xs text-text-tertiary">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded text-xs text-text-secondary border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded text-xs text-text-secondary border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
