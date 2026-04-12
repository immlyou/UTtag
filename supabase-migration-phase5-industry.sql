-- ============================================
-- Phase 5: Industry Vertical + Security Hardening
-- ============================================
-- Apply AFTER the main supabase-schema.sql has been applied.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where possible.

BEGIN;

-- --------------------------------------------
-- 1. Industry vertical on clients
-- --------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'generic';

-- CHECK constraint: add separately so it can be dropped/replaced later
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_industry_check'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT clients_industry_check
      CHECK (industry IN ('generic', 'cold_chain', 'biomedical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_industry ON clients(industry);

-- --------------------------------------------
-- 2. Industry defaults (thresholds, feature whitelist, templates)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS industry_defaults (
  industry TEXT PRIMARY KEY
    CHECK (industry IN ('generic', 'cold_chain', 'biomedical')),
  display_name TEXT NOT NULL,

  -- Sensor thresholds (defaults; tenant can override via sensor_bindings)
  temp_min NUMERIC,
  temp_max NUMERIC,
  humidity_min NUMERIC,
  humidity_max NUMERIC,

  -- Anti-spam
  alert_cooldown_seconds INTEGER DEFAULT 300,

  -- Frontend feature whitelist (keys consumed by js/industry-gate.js)
  features JSONB NOT NULL DEFAULT '[]',

  -- Report templates available for this vertical
  report_templates JSONB NOT NULL DEFAULT '[]',

  -- Branding hints (tenant_settings can override)
  default_primary_color TEXT DEFAULT '#0066cc',
  default_logo_url TEXT,

  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO industry_defaults
  (industry, display_name, temp_min, temp_max, humidity_min, humidity_max,
   alert_cooldown_seconds, features, report_templates, default_primary_color)
VALUES
  ('generic', '通用 Demo',
   -20, 60, 0, 100, 600,
   '["dashboard","map","tags","alerts","reports","settings"]'::jsonb,
   '["daily_summary","weekly_summary"]'::jsonb,
   '#0066cc'),
  ('cold_chain', '冷鏈運輸',
   2, 8, 30, 85, 180,
   '["dashboard","map","tags","alerts","transit_monitor","haccp_daily","cold_excursion","reports","settings"]'::jsonb,
   '["haccp_daily","cold_excursion","transit_report"]'::jsonb,
   '#006ba6'),
  ('biomedical', '生醫 / 疫苗',
   2, 8, 20, 60, 120,
   '["dashboard","map","tags","alerts","batch_tracking","compliance_trail","reports","settings"]'::jsonb,
   '["batch_traceability","compliance_21cfr11","cold_excursion"]'::jsonb,
   '#8b1a1a')
ON CONFLICT (industry) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  temp_min               = EXCLUDED.temp_min,
  temp_max               = EXCLUDED.temp_max,
  humidity_min           = EXCLUDED.humidity_min,
  humidity_max           = EXCLUDED.humidity_max,
  alert_cooldown_seconds = EXCLUDED.alert_cooldown_seconds,
  features               = EXCLUDED.features,
  report_templates       = EXCLUDED.report_templates,
  default_primary_color  = EXCLUDED.default_primary_color,
  updated_at             = now();

-- --------------------------------------------
-- 3. Admin lockout fields (mirror tenant_users for S1 fix)
-- --------------------------------------------
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMIT;
