import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'alertas@saintgermain.com.br'
const ALERT_EMAIL = process.env.ALERT_EMAIL || ''

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '🟡',
  low: '🟢',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

interface AlertPayload {
  severity: 'critical' | 'high' | 'medium' | 'low'
  module: string
  title: string
  description: string
  metadata?: Record<string, unknown>
}

class EmailService {
  private enabled(): boolean {
    return !!(process.env.RESEND_API_KEY && ALERT_EMAIL)
  }

  async sendAlertEmail(alert: AlertPayload): Promise<void> {
    if (!this.enabled()) {
      console.log(`[EmailService] Disabled — alert would send: [${alert.severity}] ${alert.title}`)
      return
    }

    const emoji = SEVERITY_EMOJI[alert.severity] || '📢'
    const color = SEVERITY_COLOR[alert.severity] || '#888888'
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    const html = `
      <div style="font-family: 'Inter', sans-serif; background: #0a0a0a; color: #ffffff; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
        <div style="border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; color: ${color};">
            ${emoji} ${alert.severity.toUpperCase()} — ${alert.module}
          </h1>
          <p style="margin: 8px 0 0; color: #888888; font-size: 14px;">${now} (Horário de Brasília)</p>
        </div>

        <div style="background: #111111; border: 1px solid #1e1e1e; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 12px; font-size: 16px; color: #ffffff;">${alert.title}</h2>
          <p style="margin: 0; color: #aaaaaa; line-height: 1.6;">${alert.description}</p>
        </div>

        ${alert.metadata ? `
        <div style="background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 8px; padding: 16px;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Dados</p>
          <pre style="margin: 0; color: #888888; font-size: 12px; overflow-x: auto;">${JSON.stringify(alert.metadata, null, 2)}</pre>
        </div>
        ` : ''}

        <p style="margin: 24px 0 0; font-size: 12px; color: #444444; text-align: center;">
          Saint Germain — Central Operacional
        </p>
      </div>
    `

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [ALERT_EMAIL],
        subject: `${emoji} [${alert.severity.toUpperCase()}] ${alert.module}: ${alert.title}`,
        html,
      })
      console.log(`[EmailService] Alert sent: [${alert.severity}] ${alert.title}`)
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error)
    }
  }

  async sendDailySummary(summary: string): Promise<void> {
    if (!this.enabled()) return

    const now = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [ALERT_EMAIL],
        subject: `📊 Resumo Diário Saint Germain — ${now}`,
        html: `
          <div style="font-family: 'Inter', sans-serif; background: #0a0a0a; color: #ffffff; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <h1 style="font-size: 20px; color: #f5e6d0; margin-bottom: 24px;">📊 Resumo Operacional — ${now}</h1>
            <div style="background: #111111; border: 1px solid #1e1e1e; border-radius: 8px; padding: 20px; white-space: pre-wrap; color: #aaaaaa; line-height: 1.7;">${summary}</div>
            <p style="margin: 24px 0 0; font-size: 12px; color: #444444; text-align: center;">Saint Germain — Central Operacional</p>
          </div>
        `,
      })
    } catch (error) {
      console.error('[EmailService] Failed to send daily summary:', error)
    }
  }
}

export default new EmailService()
