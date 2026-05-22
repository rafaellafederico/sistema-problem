import axios, { AxiosInstance } from 'axios'
import dotenv from 'dotenv'

dotenv.config()

export interface SendMessageOptions {
  phone: string
  message: string
  delay?: number
}

export interface SendGroupMessageOptions {
  groupId: string
  message: string
}

export interface AlertMessageData {
  severity: 'critical' | 'high' | 'medium' | 'low'
  module: string
  title: string
  description: string
  timestamp?: string
}

export interface ConnectionStatus {
  connected: boolean
  state: 'open' | 'connecting' | 'close' | 'unknown'
  qrcode?: string
  instance: string
}

const severityEmojis: Record<string, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '🟡',
  low: '🟢',
}

class EvolutionApiService {
  private client: AxiosInstance
  private instanceName: string
  private groupId: string
  private alertPhone: string

  constructor() {
    const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
    const apiKey = process.env.EVOLUTION_API_KEY || ''

    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'saint-germain'
    this.groupId = process.env.WHATSAPP_GROUP_ID || ''
    this.alertPhone = process.env.ALERT_PHONE_NUMBER || ''

    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    })
  }

  async sendMessage(phone: string, message: string): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/message/sendText/${this.instanceName}`,
        {
          number: phone,
          text: message,
          delay: 1000,
        }
      )
      return response.status === 201 || response.status === 200
    } catch (error) {
      console.error('[EvolutionApiService] Error sending message:', error)
      return false
    }
  }

  async sendToGroup(groupId: string, message: string): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/message/sendText/${this.instanceName}`,
        {
          number: groupId,
          text: message,
          delay: 500,
        }
      )
      return response.status === 201 || response.status === 200
    } catch (error) {
      console.error('[EvolutionApiService] Error sending group message:', error)
      return false
    }
  }

  formatAlertMessage(alert: AlertMessageData): string {
    const emoji = severityEmojis[alert.severity] || '📢'
    const severity = alert.severity.toUpperCase()
    const ts = alert.timestamp
      ? new Date(alert.timestamp).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })
      : new Date().toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })

    return `${emoji} *ALERTA ${severity}* — Saint Germain

📦 *Módulo:* ${alert.module}
📌 *Título:* ${alert.title}

📝 ${alert.description}

🕐 _${ts}_
_Central Operacional SG_`
  }

  async sendAlertMessage(alert: AlertMessageData): Promise<{ phone: boolean; group: boolean }> {
    const message = this.formatAlertMessage(alert)
    const results = { phone: false, group: false }

    // Send to alert phone if configured
    if (this.alertPhone) {
      results.phone = await this.sendMessage(this.alertPhone, message)
    }

    // Send to group if configured
    if (this.groupId) {
      results.group = await this.sendToGroup(this.groupId, message)
    }

    return results
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const response = await this.client.get(
        `/instance/connectionState/${this.instanceName}`
      )
      const data = response.data

      return {
        connected: data?.instance?.state === 'open',
        state: data?.instance?.state || 'unknown',
        instance: this.instanceName,
      }
    } catch (error) {
      console.error('[EvolutionApiService] Error checking connection:', error)
      return {
        connected: false,
        state: 'unknown',
        instance: this.instanceName,
      }
    }
  }

  async sendDailyReport(reportText: string): Promise<boolean> {
    if (!this.groupId && !this.alertPhone) {
      console.warn('[EvolutionApiService] No group or phone configured for reports')
      return false
    }

    const target = this.groupId || this.alertPhone
    const header = `📊 *RELATÓRIO DIÁRIO — Saint Germain*\n_${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })}_\n\n`

    return this.sendToGroup(target, header + reportText)
  }
}

export const evolutionApiService = new EvolutionApiService()
export default evolutionApiService
