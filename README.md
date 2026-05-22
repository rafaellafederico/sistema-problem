# Saint Germain Central Operacional

Real-time operational intelligence dashboard for Saint Germain e-commerce.

## Stack

- **Frontend**: Next.js 14, Tailwind CSS, Recharts, Supabase Realtime
- **Backend**: Node.js, Express, TypeScript, node-cron
- **Database**: Supabase (PostgreSQL + Realtime)
- **AI**: OpenAI GPT-4o-mini
- **Alerts**: Evolution API (WhatsApp Web)
- **Automation**: n8n workflows
- **Infra**: Docker Compose, Nginx

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/saint-germain-central.git
cd saint-germain-central

# 2. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your credentials

# 3. Run Supabase migration
# Paste supabase/migrations/001_initial_schema.sql in Supabase SQL Editor

# 4. Start everything
docker compose up -d --build

# 5. Open dashboard
open http://localhost:3000
```

Full setup guide: [docs/SETUP.md](docs/SETUP.md)

## Features

- Real-time metrics: revenue, orders, ticket, conversion, payment approval
- Live alert feed with severity levels (critical / high / medium / low)
- Sales chart: current day vs yesterday (hourly)
- AI-powered insights panel with GPT-4o-mini analysis
- Incident history table with sort and pagination
- WhatsApp notifications for critical/high alerts
- Instagram complaint detection with AI classification
- Site uptime monitoring (every minute)
- Daily AI executive report via WhatsApp
- n8n automation workflows for all data pipelines

## Project Structure

```
├── frontend/          Next.js 14 dashboard
├── backend/           Node.js Express API + workers
├── supabase/          Database migrations
├── n8n-workflows/     Automation workflow JSONs
├── nginx/             Reverse proxy config
├── docs/              Architecture & setup docs
└── docker-compose.yml Full stack orchestration
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram and data flow documentation.
