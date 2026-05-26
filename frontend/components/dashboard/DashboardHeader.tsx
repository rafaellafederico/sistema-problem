'use client'

import { format } from 'date-fns'
import LiveClock from '@/components/ui/LiveClock'

interface DashboardHeaderProps {
  lastSync: Date
  isOnline: boolean
}

export default function DashboardHeader({ lastSync, isOnline }: DashboardHeaderProps) {
  const syncTime = format(lastSync, 'HH:mm:ss')

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Left: Logo + Title */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-accent shadow-sm">
              <span className="text-background font-bold text-sm tracking-tight select-none">
                SG
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-text-primary font-semibold text-sm leading-tight tracking-tight">
                Saint Germain
              </span>
              <span className="text-text-secondary text-xs font-medium tracking-widest uppercase">
                Central Operacional
              </span>
            </div>

            <div className="hidden md:block h-6 w-px bg-border mx-1" />

            <div className="hidden md:flex items-center gap-2">
              <div className="relative flex items-center justify-center w-2 h-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                    isOnline ? 'bg-low' : 'bg-critical'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isOnline ? 'bg-low' : 'bg-critical'
                  }`}
                />
              </div>
              <span className="text-xs text-text-secondary font-medium">
                {isOnline ? 'Sistema Online' : 'Sem Conexão'}
              </span>
            </div>
          </div>

          {/* Right: Clock + Sync */}
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">
                Última Sincronização
              </span>
              <span className="text-xs font-mono text-text-secondary">{syncTime}</span>
            </div>

            <div className="hidden sm:block h-6 w-px bg-border" />

            <LiveClock />

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-low/30 bg-low-bg">
              <span className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
              <span className="text-low text-xs font-semibold tracking-wider uppercase">
                Ao Vivo
              </span>
            </div>
          </div>

        </div>
      </div>
    </header>
  )
}
