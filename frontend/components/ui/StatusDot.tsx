import { clsx } from 'clsx'

interface StatusDotProps {
  status: 'online' | 'degraded' | 'offline'
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const statusConfig: Record<
  'online' | 'degraded' | 'offline',
  { color: string; pingColor: string; label: string }
> = {
  online: {
    color: 'bg-low',
    pingColor: 'bg-low',
    label: 'Online',
  },
  degraded: {
    color: 'bg-medium',
    pingColor: 'bg-medium',
    label: 'Degradado',
  },
  offline: {
    color: 'bg-critical',
    pingColor: 'bg-critical',
    label: 'Offline',
  },
}

export default function StatusDot({ status, showLabel = false, size = 'sm' }: StatusDotProps) {
  const config = statusConfig[status]
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex items-center justify-center">
        {status === 'degraded' && (
          <span
            className={clsx(
              'absolute inline-flex rounded-full opacity-75',
              dotSize,
              config.pingColor,
              'animate-ping'
            )}
          />
        )}
        <span
          className={clsx(
            'relative inline-flex rounded-full',
            dotSize,
            config.color
          )}
        />
      </div>
      {showLabel && (
        <span
          className={clsx(
            'text-[10px] font-medium',
            status === 'online' && 'text-low',
            status === 'degraded' && 'text-medium',
            status === 'offline' && 'text-critical'
          )}
        >
          {config.label}
        </span>
      )}
    </div>
  )
}
