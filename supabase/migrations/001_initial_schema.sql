-- ============================================================
-- Saint Germain Central Operacional — Initial Database Schema
-- Migration: 001
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notified_whatsapp BOOLEAN DEFAULT FALSE
);

-- ─── sales_metrics ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  revenue_brl DECIMAL(12,2) DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  avg_ticket_brl DECIMAL(10,2) DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  pix_orders INTEGER DEFAULT 0,
  card_orders INTEGER DEFAULT 0,
  boleto_orders INTEGER DEFAULT 0,
  coupon_uses INTEGER DEFAULT 0,
  abandoned_carts INTEGER DEFAULT 0,
  checkout_sessions INTEGER DEFAULT 0
);

-- ─── payment_metrics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  card_approval_rate DECIMAL(5,2),
  pix_approval_rate DECIMAL(5,2),
  total_transactions INTEGER DEFAULT 0,
  failed_transactions INTEGER DEFAULT 0,
  refunds_count INTEGER DEFAULT 0,
  refunds_amount_brl DECIMAL(10,2) DEFAULT 0
);

-- ─── complaints ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('instagram_dm', 'instagram_comment', 'email', 'whatsapp', 'site')),
  content TEXT NOT NULL,
  customer_identifier TEXT,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category TEXT,
  keywords TEXT[],
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  grouped_with UUID[],
  pattern_id UUID,
  resolved BOOLEAN DEFAULT FALSE
);

-- ─── anomaly_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  anomaly_type TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  metric_value DECIMAL(12,4),
  baseline_value DECIMAL(12,4),
  deviation_percent DECIMAL(6,2),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  false_positive BOOLEAN DEFAULT FALSE,
  ai_analysis TEXT
);

-- ─── coupon_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('applied', 'failed', 'expired', 'limit_reached')),
  order_id TEXT,
  customer_id TEXT,
  discount_amount_brl DECIMAL(10,2),
  error_reason TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── system_health ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  response_time_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  uptime_percent DECIMAL(5,2)
);

-- ─── campaigns ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  expected_revenue_brl DECIMAL(12,2),
  actual_revenue_brl DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  performance_score DECIMAL(3,2),
  anomalies_detected INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ai_insights ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence DECIMAL(3,2),
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  related_alert_ids UUID[],
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service key)
CREATE POLICY "Service role full access on alerts"
  ON alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on sales_metrics"
  ON sales_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on payment_metrics"
  ON payment_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on complaints"
  ON complaints FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on anomaly_logs"
  ON anomaly_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on coupon_logs"
  ON coupon_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on system_health"
  ON system_health FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on campaigns"
  ON campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ai_insights"
  ON ai_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon read for dashboard (frontend uses anon key)
CREATE POLICY "Anon read alerts"
  ON alerts FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read sales_metrics"
  ON sales_metrics FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read ai_insights"
  ON ai_insights FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read system_health"
  ON system_health FOR SELECT TO anon USING (true);

-- ============================================================
-- Realtime Publications
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE sales_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_insights;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_module ON alerts(module);

CREATE INDEX IF NOT EXISTS idx_sales_snapshot_at ON sales_metrics(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_complaints_detected_at ON complaints(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_source ON complaints(source);
CREATE INDEX IF NOT EXISTS idx_complaints_severity ON complaints(severity);

CREATE INDEX IF NOT EXISTS idx_system_health_service ON system_health(service, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_checked_at ON system_health(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_logs_detected_at ON anomaly_logs(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_logs_type ON anomaly_logs(anomaly_type);

CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON ai_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);

CREATE INDEX IF NOT EXISTS idx_coupon_logs_code ON coupon_logs(coupon_code);
CREATE INDEX IF NOT EXISTS idx_coupon_logs_occurred_at ON coupon_logs(occurred_at DESC);
