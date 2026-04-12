-- ============================================
-- Phase 5c: Persistent Tenant Alerts (optional)
-- ============================================
-- Currently api/tenant/alerts.js derives violations on the fly from the
-- last 24h of sensor_data. That is fine for a dashboard but gives no
-- long-term history. This migration provisions the storage side so that
-- a future ingestion job (scheduler or trigger) can persist alerts.
--
-- Nothing in the application writes to this table yet — applying this
-- migration is non-breaking. When you are ready to wire persistence,
-- add an UPSERT inside api/tenant/alerts.js or a Supabase trigger on
-- sensor_data INSERT.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_alerts (
  id           BIGSERIAL PRIMARY KEY,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  mac          TEXT NOT NULL,
  kind         TEXT NOT NULL
    CHECK (kind IN ('temp_low','temp_high','humidity_low','humidity_high')),
  metric       TEXT NOT NULL CHECK (metric IN ('temperature','humidity')),
  value        NUMERIC NOT NULL,
  threshold    NUMERIC NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'warn'
    CHECK (severity IN ('info','warn','critical')),
  occurred_at  TIMESTAMPTZ NOT NULL,
  -- Minute-bucket for dedup: same (mac, kind) within the same minute
  -- collapses to one row. Makes ingestion idempotent.
  occurred_bucket TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('minute', occurred_at)) STORED,
  resolved_at  TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (mac, kind, occurred_bucket)
);

CREATE INDEX IF NOT EXISTS idx_tenant_alerts_client_time
  ON tenant_alerts (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_alerts_open
  ON tenant_alerts (client_id, occurred_at DESC)
  WHERE resolved_at IS NULL;

-- RLS: same defense-in-depth shape as the rest of the phase5b policies.
ALTER TABLE tenant_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename='tenant_alerts' AND policyname='tenant_alerts_isolation') THEN
    CREATE POLICY tenant_alerts_isolation ON tenant_alerts FOR ALL
      USING (tenant_owns(client_id))
      WITH CHECK (tenant_owns(client_id));
  END IF;
END $$;

COMMIT;
