import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const SYSTEM_PROMPT = `Você é um assistente de inteligência operacional especializado em e-commerce brasileiro.
Sua função é analisar dados de operação de uma loja online premium (Saint Germain) e identificar:
- Anomalias em métricas de vendas, conversão e pagamentos
- Padrões de reclamações de clientes
- Riscos operacionais iminentes
- Oportunidades de otimização

Responda sempre em português brasileiro de forma concisa e objetiva.
Priorize insights acionáveis com impacto direto em receita ou experiência do cliente.`

class OpenAIService {
  private client: OpenAI | null = null

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured')
      }
      this.client = new OpenAI({ apiKey })
    }
    return this.client
  }

  async analyzeComplaints(
    complaints: string[]
  ): Promise<{ category: string; severity: string; pattern: string; recommendation: string }> {
    const client = this.getClient()

    const prompt = `Analise as seguintes reclamações de clientes de uma loja de moda premium:

${complaints.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

Retorne um JSON com:
{
  "category": "categoria principal (entrega/produto/pagamento/atendimento/site)",
  "severity": "critical|high|medium|low",
  "pattern": "descrição do padrão identificado em 1-2 frases",
  "recommendation": "ação recomendada em 1-2 frases"
}`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '{}'
    return JSON.parse(content)
  }

  async detectOperationalAnomaly(metrics: {
    current: Record<string, number>
    baseline: Record<string, number>
    period: string
  }): Promise<{
    anomaly_detected: boolean
    severity: string
    description: string
    confidence: number
    recommendation: string
  }> {
    const client = this.getClient()

    const prompt = `Analise estas métricas operacionais e detecte anomalias:

Período: ${metrics.period}

Métricas atuais:
${Object.entries(metrics.current)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

Baseline (média histórica):
${Object.entries(metrics.baseline)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

Retorne um JSON com:
{
  "anomaly_detected": boolean,
  "severity": "critical|high|medium|low",
  "description": "descrição da anomalia em 2-3 frases",
  "confidence": 0.0-1.0,
  "recommendation": "ação recomendada imediata"
}`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content || '{}'
    return JSON.parse(content)
  }

  async generateInsight(data: {
    type: 'sales' | 'payments' | 'complaints' | 'general'
    metrics: Record<string, unknown>
    alerts?: string[]
    timeframe?: string
  }): Promise<{
    title: string
    summary: string
    confidence: number
    severity: string
    insight_type: string
  }> {
    const client = this.getClient()

    const prompt = `Gere um insight operacional baseado nos seguintes dados:

Tipo: ${data.type}
Timeframe: ${data.timeframe || 'últimas 24h'}

Dados:
${JSON.stringify(data.metrics, null, 2)}

${data.alerts && data.alerts.length > 0 ? `Alertas recentes:\n${data.alerts.join('\n')}` : ''}

Retorne um JSON com:
{
  "title": "título conciso do insight (máx 60 chars)",
  "summary": "análise detalhada e ação recomendada (2-4 frases)",
  "confidence": 0.0-1.0,
  "severity": "critical|high|medium|low",
  "insight_type": "anomaly|opportunity|prediction|warning"
}`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.4,
    })

    const content = response.choices[0]?.message?.content || '{}'
    return JSON.parse(content)
  }

  async summarizeAlerts(alerts: Array<{
    severity: string
    module: string
    title: string
    description: string
    created_at: string
  }>): Promise<{
    executive_summary: string
    critical_actions: string[]
    overall_status: string
    risk_level: string
  }> {
    const client = this.getClient()

    const alertsText = alerts
      .map((a) => `[${a.severity.toUpperCase()}] ${a.module}: ${a.title} — ${a.description}`)
      .join('\n')

    const prompt = `Crie um resumo executivo dos seguintes alertas operacionais:

${alertsText}

Retorne um JSON com:
{
  "executive_summary": "resumo executivo em 2-3 frases para a diretoria",
  "critical_actions": ["ação 1", "ação 2", "ação 3"],
  "overall_status": "Normal|Atenção|Crítico",
  "risk_level": "low|medium|high|critical"
}`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 700,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '{}'
    return JSON.parse(content)
  }
}

export const openaiService = new OpenAIService()
export default openaiService
