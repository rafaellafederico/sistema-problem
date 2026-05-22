import { AlertSeverity } from '@/lib/types'
import { clsx } from 'clsx'

interface SeverityBadgeProps {
  severity: AlertSeverity
  size?: 'sm' | 'md'
}

const severityConfig: Record<
  AlertSeverity,
  { label: string; classes: string }
> = {
  critical: {
    label: 'Crítico',
    classes: 'bg-critical-bg text-critical border-critical/30',
  },
  high: {
    label: 'Alto',
    classes: 'bg-high-bg text-high border-high/30',
  },
  medium: {
    label: 'Médio',
    classes: 'bg-medium-bg text-medium border-medium/30',
  },
  low: {
    label: 'Baixo',
    classes: 'bg-low-bg text-low border-low/30',
  },
}

export default function SeverityBadge({ severity, size = 'sm' }: SeverityBadgeProps) {
  const config = severityConfig[severity]

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border font-bold uppercase tracking-widest',
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]',
        config.classes
      )}
    >
      {config.label}
    </span>
  )
}
