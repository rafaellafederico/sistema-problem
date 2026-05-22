import axios from 'axios'
import supabaseService from './supabaseService'
import emailService from './emailService'

const GRAPH_API = 'https://graph.facebook.com/v19.0'

const INSTABILITY_KEYWORDS = [
  'site caiu', 'site fora', 'checkout travando', 'não consigo finalizar',
  'pix não aprova', 'cupom não funciona', 'promoção não aplica',
  'pagamento não aprovado', 'não carrega', 'tá travado', 'bugando',
  'deu erro', 'não abre', 'erro na compra', 'não finaliza',
  'código não funciona', 'desconto não aplica',
]

const ALL_COMPLAINT_KEYWORDS = [
  ...INSTABILITY_KEYWORDS,
  'não chegou', 'cadê meu pedido', 'atraso', 'produto errado', 'defeito',
  'horrível', 'péssimo', 'absurdo', 'vergonha', 'decepcionada', 'decepcionado',
  'nunca mais', 'cancelar', 'reembolso', 'devolver', 'fraude', 'golpe',
]

function isComplaint(text: string): boolean {
  const lower = text.toLowerCase()
  return ALL_COMPLAINT_KEYWORDS.some((kw) => lower.includes(kw))
}

function isInstability(text: string): boolean {
  const lower = text.toLowerCase()
  return INSTABILITY_KEYWORDS.some((kw) => lower.includes(kw))
}

function matchedKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  return ALL_COMPLAINT_KEYWORDS.filter((kw) => lower.includes(kw))
}

function severity(text: string): 'critical' | 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase()
  if (['fraude', 'golpe', 'procon', 'processo', 'reclame aqui'].some((w) => lower.includes(w)))
    return 'critical'
  const hits = matchedKeywords(text).length
  if (hits >= 3) return 'high'
  if (hits >= 1) return 'medium'
  return 'low'
}

interface GraphComment {
  id: string
  text: string
  timestamp: string
  username?: string
  from?: { id: string; name: string }
}

interface GraphMedia {
  id: string
  timestamp: string
  caption?: string
}

class InstagramService {
  private token(): string | null {
    return process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || null
  }

  private userId(): string | null {
    return process.env.INSTAGRAM_USER_ID || null
  }

  private enabled(): boolean {
    return !!(this.token() && this.userId())
  }

  // Busca os últimos posts da conta
  async fetchRecentMedia(limit = 10): Promise<GraphMedia[]> {
    if (!this.enabled()) return []

    try {
      const { data } = await axios.get(`${GRAPH_API}/${this.userId()}/media`, {
        params: {
          fields: 'id,timestamp,caption',
          limit,
          access_token: this.token(),
        },
        timeout: 10000,
      })
      return data.data || []
    } catch (error) {
      console.error('[InstagramService] Failed to fetch media:', error)
      return []
    }
  }

  // Busca comentários de um post específico
  async fetchComments(mediaId: string, limit = 50): Promise<GraphComment[]> {
    if (!this.enabled()) return []

    try {
      const { data } = await axios.get(`${GRAPH_API}/${mediaId}/comments`, {
        params: {
          fields: 'id,text,timestamp,username,from',
          limit,
          access_token: this.token(),
        },
        timeout: 10000,
      })
      return data.data || []
    } catch (error) {
      console.error(`[InstagramService] Failed to fetch comments for ${mediaId}:`, error)
      return []
    }
  }

  // Varredura principal — busca posts recentes e analisa comentários
  async pollRecentComments(): Promise<{
    posts_checked: number
    comments_analyzed: number
    complaints_found: number
    instability_found: number
  }> {
    if (!this.enabled()) {
      console.log('[InstagramService] Graph API not configured — skipping poll')
      return { posts_checked: 0, comments_analyzed: 0, complaints_found: 0, instability_found: 0 }
    }

    console.log('[InstagramService] Polling recent Instagram comments...')

    const media = await this.fetchRecentMedia(5)
    let commentsAnalyzed = 0
    let complaintsFound = 0
    let instabilityFound = 0

    // Only look at posts from last 48h
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const recentMedia = media.filter((m) => new Date(m.timestamp) > cutoff)

    for (const post of recentMedia) {
      const comments = await this.fetchComments(post.id)
      commentsAnalyzed += comments.length

      // Only analyze comments from last 2 hours
      const recentComments = comments.filter(
        (c) => new Date(c.timestamp) > new Date(Date.now() - 2 * 60 * 60 * 1000)
      )

      for (const comment of recentComments) {
        if (!isComplaint(comment.text)) continue

        complaintsFound++
        if (isInstability(comment.text)) instabilityFound++

        const sev = severity(comment.text)
        const keywords = matchedKeywords(comment.text)

        // Avoid duplicate saves by checking recent complaints
        const supabase = (await import('../config/database')).default
        const { data: existing } = await supabase
          .from('complaints')
          .select('id')
          .eq('customer_identifier', comment.id)
          .limit(1)

        if (existing && existing.length > 0) continue

        await supabaseService.saveComplaint({
          source: 'instagram_comment',
          content: comment.text,
          customer_identifier: comment.id,
          severity: sev,
          keywords,
          category: isInstability(comment.text) ? 'instabilidade' : 'reclamacao',
        })

        if (sev === 'critical' || sev === 'high') {
          await supabaseService.saveAlert({
            severity: sev,
            module: 'Instagram',
            title: `Comentário ${sev === 'critical' ? 'crítico' : 'grave'} detectado`,
            description: comment.text.substring(0, 300),
            source: 'instagram_poll',
            metadata: {
              comment_id: comment.id,
              media_id: post.id,
              username: comment.username,
              keywords,
            },
          })
        }
      }
    }

    // Detect instability spike across all recent complaints
    await this.detectInstabilitySpike()

    console.log(
      `[InstagramService] Poll done — posts: ${recentMedia.length}, comments: ${commentsAnalyzed}, complaints: ${complaintsFound}, instability: ${instabilityFound}`
    )

    return {
      posts_checked: recentMedia.length,
      comments_analyzed: commentsAnalyzed,
      complaints_found: complaintsFound,
      instability_found: instabilityFound,
    }
  }

  async detectInstabilitySpike(): Promise<void> {
    try {
      const supabase = (await import('../config/database')).default
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()

      const { data } = await supabase
        .from('complaints')
        .select('id, content, severity')
        .in('source', ['instagram_comment', 'instagram_dm'])
        .gte('detected_at', since)

      if (!data) return

      const instabilityCount = data.filter((c) => isInstability(c.content)).length
      if (instabilityCount < 5) return

      // Check for recent spike alert (last 30 min) to avoid duplicates
      const { data: recentAlerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('module', 'Instagram')
        .ilike('title', '%Spike%')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1)

      if (recentAlerts && recentAlerts.length > 0) return

      await supabaseService.saveAlert({
        severity: 'critical',
        module: 'Instagram',
        title: `Spike de instabilidade — ${instabilityCount} relatos em 15 min`,
        description: `${instabilityCount} clientes relataram instabilidade nos últimos 15 minutos. Verifique checkout, pagamento e site imediatamente.`,
        source: 'instagram',
        metadata: { instability_count: instabilityCount, window_minutes: 15 },
      })

      await emailService.sendAlertEmail({
        severity: 'critical',
        module: 'Instagram — Spike Detectado',
        title: `${instabilityCount} clientes relataram instabilidade em 15 min`,
        description:
          'Possíveis problemas em: checkout, pagamento (PIX/cartão), cupons ou disponibilidade do site. Verifique imediatamente.',
        metadata: {
          reclamacoes_instabilidade: instabilityCount,
          janela: '15 minutos',
          total_reclamacoes: data.length,
        },
      })

      console.log(`[InstagramService] SPIKE: ${instabilityCount} instability reports in 15 min`)
    } catch (error) {
      console.error('[InstagramService] Spike detection error:', error)
    }
  }
}

export default new InstagramService()
