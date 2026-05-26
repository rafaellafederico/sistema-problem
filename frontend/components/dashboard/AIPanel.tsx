'use client'

import { useState } from 'react'
import { Brain, Sparkles, ChevronRight, RefreshCw, TrendingUp, AlertCircle, Target } from 'lucide-react'
import { AIInsight } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { clsx } from 'clsx'

interface AIPanelProps {
  insights: AIInsight[]
}

const insightTypeConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: string
  bg: string
}> = {
  anomaly: {
    icon: AlertCircle,
    label: 'Anomalia',
    color: 'text-high',
    bg: 'bg-high-bg',
  },
  opportunity: {
    icon: Target,
    label: 'Oportunidade',
    color: 'text-medium',
    bg: 'bg-medium-bg',
  },
  prediction: {
    icon: TrendingUp,
    label: 'Previsão',
    color: 'text-low',
    bg: 'bg-low-bg',
  },
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100)
  const color =
    percent >= 80 ? 'bg-low' : percent >= 60 ? 'bg-medium' : 'bg-high'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-tertiary tabular-nums w-8 text-right">
        {percent}%
      </span>
    </div>
  )
}

function InsightCard({ insight }: { insight: AIInsight }) {
  const [expanded, setExpanded] = useState(false)
  const config = insightTypeConfig[insight.insight_type] || insightTypeConfig.prediction
  const IconComponent = config.icon
  const timeAgo = formatDistanceToNow(new Date(insight.created_at), {
    addSuffix: true,
    locale: ptBR,
  })

  return (
    <div
      className="border border-border rounded-lg overflow-hidden transition-all duration-200 hover:border-border-2"
      role="article"
    >
      {/* Card Header */}
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-surface-2 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div
          className={clsx(
            'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg mt-0.5',
            config.bg
          )}
        >
          <IconComponent className={clsx('w-4 h-4', config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={clsx(
                'text-[10px] font-bold uppercase tracking-wider',
                config.color
              )}
            >
              {config.label}
            </span>
            <span className="text-[10px] text-text-tertiary">{timeAgo}</span>
          </div>
          <p className="text-xs font-semibold text-text-primary leading-snug line-clamp-2">
            {insight.title}
          </p>
          <div className="mt-2">
            <ConfidenceBar confidence={insight.confidence} />
          </div>
        </div>

        <ChevronRight
          className={clsx(
            'w-4 h-4 text-text-tertiary flex-shrink-0 mt-1 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-text-secondary leading-relaxed">
              {insight.summary}
            </p>
            {insight.related_alert_ids && insight.related_alert_ids.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-text-tertiary">Alertas relacionados:</span>
                <span className="text-[10px] font-mono text-accent">
                  {insight.related_alert_ids.length}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border rounded-lg p-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-3 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 bg-surface-3 rounded w-2/3" />
              <div className="h-2 bg-surface-3 rounded w-full" />
              <div className="h-1 bg-surface-3 rounded w-full mt-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AIPanel({ insights }: AIPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentInsights, setCurrentInsights] = useState<AIInsight[]>(insights)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/api/ai/insights`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.insights) && data.insights.length > 0) {
          setCurrentInsights(data.insights)
        }
      }
      setLastGenerated(new Date())
    } catch {
      // Keep existing insights on error
    } finally {
      setIsGenerating(false)
    }
  }

  const avgConfidence =
    currentInsights.length > 0
      ? currentInsights.reduce((sum, i) => sum + i.confidence, 0) / currentInsights.length
      : 0

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain className="w-4 h-4 text-accent" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
          </div>
          <span className="text-sm font-semibold text-text-primary">IA Operacional</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-tertiary">
            GPT-4o-mini
          </span>
        </div>
      </div>

      {/* Status Summary */}
      <div className="mx-4 my-3 p-3 rounded-lg bg-surface-3 border border-border flex-shrink-0">
        <div className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary mb-0.5">
              Status Operacional IA
            </p>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {currentInsights.length} insights ativos · confiança média{' '}
              <span className="text-accent font-semibold">
                {Math.round(avgConfidence * 100)}%
              </span>
              {' '}· monitoramento contínuo ativo
            </p>
          </div>
        </div>
      </div>

      {/* Insights List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-3 space-y-2">
        {isGenerating ? (
          <LoadingSkeleton />
        ) : currentInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-10 text-center">
            <Brain className="w-8 h-8 text-text-tertiary opacity-30" />
            <div>
              <p className="text-xs font-medium text-text-secondary">Nenhum insight gerado</p>
              <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                Clique em "Gerar Nova Análise" para que a IA analise os alertas ativos.
              </p>
            </div>
          </div>
        ) : (
          currentInsights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))
        )}
      </div>

      {/* Footer / Generate Button */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
            'text-xs font-semibold border transition-all duration-200',
            isGenerating
              ? 'border-border bg-surface text-text-tertiary cursor-not-allowed'
              : 'border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/50 active:scale-[0.99]'
          )}
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', isGenerating && 'animate-spin')} />
          {isGenerating ? 'Gerando análise...' : 'Gerar Nova Análise'}
        </button>
        {lastGenerated && (
          <p className="text-[10px] text-text-tertiary text-center mt-1.5 font-mono">
            Gerado às{' '}
            {lastGenerated.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  )
}
