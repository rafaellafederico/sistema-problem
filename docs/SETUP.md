# Setup Guide — Saint Germain Central Operacional

## Prerequisites

- VPS Ubuntu 22.04+ with minimum 2 vCPU / 4GB RAM
- Docker and Docker Compose installed
- Domain name pointed to VPS IP (optional for local development)
- Supabase account (free tier works)
- OpenAI API key (GPT-4o-mini usage is very affordable)
- Nuvemshop store credentials
- Evolution API instance (WhatsApp Web)

---

## Step 1 — Clone Repository

```bash
git clone https://github.com/your-org/saint-germain-central.git
cd saint-germain-central
```

---

## Step 2 — Configure Environment Variables

### Frontend
```bash
cp frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with all values:
```env
PORT=3001
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your-service-role-key
OPENAI_API_KEY=sk-proj-...
NUVEMSHOP_STORE_ID=123456
NUVEMSHOP_ACCESS_TOKEN=your-access-token
EVOLUTION_API_URL=http://your-vps-ip:8080
EVOLUTION_API_KEY=your-evolution-key
EVOLUTION_INSTANCE_NAME=saint-germain
WHATSAPP_GROUP_ID=120363XXXXXXXXXX@g.us
ALERT_PHONE_NUMBER=5511999999999
SITE_URL=https://www.saintgermain.com.br
```

### Docker Compose (root)
Create `.env` at project root for docker-compose:
```bash
cat > .env << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
OPENAI_API_KEY=sk-...
NUVEMSHOP_STORE_ID=123456
NUVEMSHOP_ACCESS_TOKEN=your-token
EVOLUTION_API_URL=http://your-evolution-host:8080
EVOLUTION_API_KEY=your-key
EVOLUTION_INSTANCE_NAME=saint-germain
WHATSAPP_GROUP_ID=120363XXXXXXXXXX@g.us
ALERT_PHONE_NUMBER=5511999999999
SITE_URL=https://www.saintgermain.com.br
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-secure-password
N8N_HOST=your-vps-ip-or-domain
EOF
```

---

## Step 3 — Run Supabase Migrations

### Option A: Using Supabase CLI
```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push supabase/migrations/001_initial_schema.sql
```

### Option B: Paste directly in Supabase Dashboard
1. Go to your Supabase project
2. Navigate to **SQL Editor**
3. Open `supabase/migrations/001_initial_schema.sql`
4. Paste and click **Run**

### Verify Tables Created
After running the migration, verify in **Table Editor** that these tables exist:
- alerts
- sales_metrics
- payment_metrics
- complaints
- anomaly_logs
- coupon_logs
- system_health
- campaigns
- ai_insights

---

## Step 4 — Start Services with Docker Compose

```bash
# Build and start all services
docker compose up -d --build

# Check all services are running
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

Expected output from `docker compose ps`:
```
NAME           STATUS          PORTS
sg-frontend    Up (healthy)    0.0.0.0:3000->3000/tcp
sg-backend     Up (healthy)    0.0.0.0:3001->3001/tcp
sg-n8n         Up              0.0.0.0:5678->5678/tcp
sg-nginx       Up              0.0.0.0:80->80/tcp
```

---

## Step 5 — Configure n8n Workflows

1. Open n8n at `http://your-server-ip:5678`
2. Login with credentials set in `.env` (`N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`)
3. Import each workflow from `n8n-workflows/`:
   - **Settings → Import Workflow** → select each `.json` file
4. Configure credentials in n8n:
   - **Nuvemshop API**: HTTP Header Auth → key `Authentication`, value `bearer YOUR_TOKEN`
5. Activate each workflow (toggle switch to ON)

### Workflow Schedule Summary
| Workflow | Trigger | Purpose |
|---|---|---|
| 01_nuvemshop_monitor | Every 5 min | Fetch orders, detect anomalies |
| 02_instagram_monitor | Webhook | Detect complaint messages |
| 03_site_uptime | Every 1 min | Monitor site availability |
| 04_daily_ai_report | Daily 8am | Generate & send AI report |

---

## Step 6 — Connect Evolution API / WhatsApp

### 6.1 Install Evolution API (if not already running)
```bash
# Quick install with Docker
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=your-key \
  -v evolution_data:/evolution/instances \
  atendai/evolution-api:latest
```

### 6.2 Create WhatsApp Instance
```bash
# Create instance via API
curl -X POST http://your-server:8080/instance/create \
  -H "apikey: your-key" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "saint-germain", "qrcode": true}'
```

### 6.3 Connect WhatsApp
```bash
# Get QR code
curl http://your-server:8080/instance/connect/saint-germain \
  -H "apikey: your-key"
```

Scan the QR code with your WhatsApp Business account. Once connected, the `state` will be `open`.

### 6.4 Verify Connection
```bash
curl http://your-server:3001/api/whatsapp/status
```

Expected: `{"status":{"connected":true,"state":"open","instance":"saint-germain"}}`

---

## Step 7 — Configure Nuvemshop Webhooks

In your Nuvemshop Admin panel:
1. Go to **Settings → Notifications → Webhooks**
2. Add webhook URLs:
   - `POST https://your-domain.com/api/nuvemshop/webhook`
   - Events: `Order Created`, `Order Paid`, `Order Cancelled`, `Payment Rejected`
3. Or configure n8n webhook URL in Nuvemshop (for workflow 01)

---

## Step 8 — Configure Instagram Webhooks (Optional)

1. Go to [Facebook Developer Portal](https://developers.facebook.com)
2. Create an app with Instagram Basic Display or Messaging API
3. Under **Webhooks**, set callback URL to:
   - `https://your-domain.com/api/instagram/webhook`
   - Or use n8n webhook URL from workflow 02
4. Subscribe to events: `messages`, `comments`, `mentions`

---

## Local Development (without Docker)

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill .env values
npm run dev
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Fill .env.local values
npm run dev
```

Open `http://localhost:3000` — the dashboard will load with mock data if Supabase is not configured.

---

## Monitoring & Maintenance

### View Backend Logs
```bash
docker compose logs -f backend --tail=100
```

### Restart a Service
```bash
docker compose restart backend
```

### Update and Redeploy
```bash
git pull
docker compose up -d --build
```

### Backup n8n Data
```bash
docker run --rm -v sg_n8n_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz /data
```
