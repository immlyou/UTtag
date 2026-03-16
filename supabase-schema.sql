-- ============================================
-- UTFind B2B API Management — Supabase Schema
-- ============================================

-- 客戶 (Clients)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company TEXT,
  phone TEXT,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  max_tags INTEGER DEFAULT 10,
  max_keys INTEGER DEFAULT 2,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  permissions TEXT[] DEFAULT ARRAY['read'],
  rate_limit INTEGER DEFAULT 60,       -- requests per minute
  daily_limit INTEGER DEFAULT 1000,    -- requests per day
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 管理員帳號
CREATE TABLE admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API 使用量紀錄
CREATE TABLE usage_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  status_code INTEGER,
  response_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 每日用量統計（自動聚合）
CREATE TABLE usage_daily (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  UNIQUE(api_key_id, date)
);

-- 計費方案定義
CREATE TABLE billing_tiers (
  tier TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly INTEGER DEFAULT 0,    -- NTD
  max_tags INTEGER,
  max_keys INTEGER,
  rate_limit INTEGER,                 -- per minute
  daily_limit INTEGER,
  features JSONB DEFAULT '[]'
);

-- 預設方案資料
INSERT INTO billing_tiers (tier, name, price_monthly, max_tags, max_keys, rate_limit, daily_limit, features) VALUES
  ('free',       '免費版',   0,     10,   2,   30,   500,    '["dashboard","alerts"]'),
  ('basic',      '基本版',   990,   100,  5,   60,   5000,   '["dashboard","alerts","reports","geofence"]'),
  ('pro',        '專業版',   2990,  500,  20,  120,  50000,  '["dashboard","alerts","reports","geofence","api","webhook","coldchain"]'),
  ('enterprise', '企業版',   0,     NULL, NULL, NULL, NULL,   '["all"]');

-- 索引
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_client ON api_keys(client_id);
CREATE INDEX idx_usage_logs_key ON usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at);
CREATE INDEX idx_usage_daily_key_date ON usage_daily(api_key_id, date);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
