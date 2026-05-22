# Saint Germain Central Operacional — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VPS Linux (Ubuntu 22.04)                        │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐               │
│  │   Nginx      │   │  Next.js 14  │   │  Node.js     │               │
│  │  (Reverse    │──▶│  Frontend    │   │  Backend     │               │
│  │   Proxy)     │   │  :3000       │   │  :3001       │               │
│  └──────────────┘   └──────────────┘   └──────┬───────┘               │
│         │                  │                   │                        │
│         │                  │         ┌─────────┴────────┐              │
│         │                  │         │   n8n Workflows  │              │
│         │                  │         │   :5678          │              │
│         │                  │         └─────────┬────────┘              │
│         │                  │                   │                        │
└─────────┼──────────────────┼───────────────────┼────────────────────────┘
          │                  │                   │
          │         ┌────────▼───────────────────▼──────┐
          │         │         Supabase (Cloud)            │
          │         │    PostgreSQL + Realtime + Auth     │
          │         └────────────────────────────────────┘
          │
    ┌─────▼──────────────────────────────────────┐
    │              External APIs                  │
    │                                             │
    │  ┌──────────────┐  ┌──────────────────┐    │
    │  │  Nuvemshop   │  │  Instagram API   │    │
    │  │  REST API    │  │  Graph API       │    │
    │  └──────────────┘  └──────────────────┘    │
    │                                             │
    │  ┌──────────────┐  ┌──────────────────┐    │
    │  │  OpenAI API  │  │  Evolution API   │    │
    │  │  GPT-4o-mini │  │  (WhatsApp Web)  │    │
    │  └──────────────┘  └──────────────────┘    │
    └────────────────────────────────────────────┘
```

## Component Descriptions

### Frontend (Next.js 14)
- **App Router** with server and client components
- **Real-time** updates via Supabase Realtime subscriptions
- **Dark premium UI** with Tailwind CSS custom theme
- Communicates with Backend API for mutations
- Reads directly from Supabase for display data (anon key)

### Backend (Node.js Express)
- REST API on port 3001
- **WebSocket** server for real-time push to connected clients
- **Cron workers**: metrics polling (5min), uptime checks (1min), AI analysis (15min)
- Orchestrates all external API calls
- Service role access to Supabase for writes

### Supabase (PostgreSQL)
- Primary data store for all operational data
- **Realtime** publications on `alerts`, `sales_metrics`, `ai_insights`
- Row Level Security (RLS) with policies for anon read / service write
- Tables: `alerts`, `sales_metrics`, `payment_metrics`, `complaints`, `anomaly_logs`, `coupon_logs`, `system_health`, `campaigns`, `ai_insights`

### n8n Workflows
- **01_nuvemshop_monitor**: Polls Nuvemshop every 5 min, computes metrics, detects anomalies
- **02_instagram_monitor**: Receives Instagram webhooks, detects complaint keywords, AI classification
- **03_site_uptime**: Polls site every 1 min, fires critical alert if offline
- **04_daily_ai_report**: Every day at 8am, generates AI executive summary and sends via WhatsApp

### Evolution API (WhatsApp)
- Self-hosted WhatsApp Web bridge
- Receives formatted alert messages from backend
- Sends to a specific phone and/or group

## Data Flow

### Alert Pipeline
```
Event Source → n8n / Backend Worker
     ↓
Anomaly Detection (rule-based + AI)
     ↓
Save to Supabase alerts table
     ↓
Supabase Realtime publishes change
     ↓
Frontend receives via WebSocket subscription
     ↓
Alert appears in AlertFeed (animated, real-time)
     ↓
[If critical/high] → Evolution API → WhatsApp notification
```

### Metrics Pipeline
```
Nuvemshop API (every 5 min)
     ↓
Backend fetches orders → compute metrics
     ↓
Save to sales_metrics table
     ↓
Compare vs baseline → anomaly detection
     ↓
[If anomaly] → create alert → notify WhatsApp
     ↓
Frontend MetricCards update via polling / realtime
```

### Instagram Complaint Pipeline
```
Instagram API Webhook POST
     ↓
n8n workflow: extract messages
     ↓
Keyword matching (30+ complaint patterns)
     ↓
AI classification via OpenAI GPT-4o-mini
     ↓
Save complaint to Supabase
     ↓
[If high/critical] → create alert → notify WhatsApp
```

## Security Considerations

1. **API Keys**: All secrets stored in `.env` files, never committed to git
2. **Supabase RLS**: Row Level Security ensures frontend anon key can only read, not write sensitive data
3. **Rate Limiting**: Express rate limiter on all routes (120 req/min general, 20 req/min for AI routes)
4. **Helmet.js**: Security headers on all responses (X-Frame-Options, CSP, etc.)
5. **CORS**: Explicit allowlist of allowed origins
6. **Nginx**: Acts as TLS terminator and additional security layer in production
7. **WebSocket**: Internal-only WebSocket path, not exposed externally without auth

## Deployment Architecture (VPS)

```
Internet → Cloudflare (optional CDN/DDoS) → VPS Public IP
                                                    │
                                             Nginx :80/:443
                                            /      |      \
                                    :3000  /    :3001 \  :5678
                                 Frontend  Backend   n8n
```

All services communicate via Docker internal network `sg-network`.
Only Nginx ports 80/443 are exposed to the public internet.
