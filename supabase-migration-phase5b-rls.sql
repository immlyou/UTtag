-- ============================================
-- Phase 5b: Row-Level Security (defense-in-depth)
-- ============================================
-- Scope: enable RLS + tenant-isolation policies on the most sensitive tables.
--
-- Important deployment notes:
--   1. The Node/Express backend currently connects with SUPABASE_SERVICE_KEY,
--      which BYPASSES RLS. Applying this migration will NOT break existing
--      server-side code — it only activates for anon / user-JWT connections.
--   2. These policies are the safety net for:
--        - mobile clients connecting directly to PostgREST with a user JWT
--        - future migration of the backend to user-scoped Supabase clients
--        - accidental leak of the anon key
--   3. The policies assume the user's JWT carries `client_id` (uuid) and
--      `role` (for superadmin detection). The tenant login in
--      api/tenant/auth.js already includes these in the signed token.
--
-- Safe to re-run: all CREATE POLICY guards with IF NOT EXISTS-style DO blocks.

BEGIN;

-- --------------------------------------------
-- Helpers
-- --------------------------------------------
-- Extract the client_id from the JWT, or NULL if not a tenant token.
CREATE OR REPLACE FUNCTION auth_client_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'client_id', '')::uuid
$$;

-- True if the JWT belongs to a superadmin (Supabase 'admins' table). Super admins
-- see everything; this mirrors lib/auth-middleware.js requireSuperAdmin.
CREATE OR REPLACE FUNCTION auth_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'superadmin',
    false
  )
$$;

-- Small wrapper for "this row belongs to caller's tenant OR caller is superadmin".
CREATE OR REPLACE FUNCTION tenant_owns(row_client_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth_is_superadmin() OR row_client_id = auth_client_id()
$$;

-- Macro-style DO block to idempotently add a policy.
-- We cannot use CREATE POLICY IF NOT EXISTS (not supported on older Postgres);
-- instead check pg_policies first.

-- --------------------------------------------
-- clients
-- --------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='clients_tenant_read') THEN
    CREATE POLICY clients_tenant_read ON clients FOR SELECT
      USING (auth_is_superadmin() OR id = auth_client_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='clients_superadmin_write') THEN
    CREATE POLICY clients_superadmin_write ON clients FOR ALL
      USING (auth_is_superadmin()) WITH CHECK (auth_is_superadmin());
  END IF;
END $$;

-- --------------------------------------------
-- tenant_users
-- --------------------------------------------
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_users' AND policyname='tenant_users_isolation') THEN
    CREATE POLICY tenant_users_isolation ON tenant_users FOR ALL
      USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- tenant_settings
-- --------------------------------------------
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_settings' AND policyname='tenant_settings_isolation') THEN
    CREATE POLICY tenant_settings_isolation ON tenant_settings FOR ALL
      USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- api_keys
-- --------------------------------------------
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_keys' AND policyname='api_keys_isolation') THEN
    CREATE POLICY api_keys_isolation ON api_keys FOR ALL
      USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- client_tags
-- --------------------------------------------
ALTER TABLE client_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_tags' AND policyname='client_tags_isolation') THEN
    CREATE POLICY client_tags_isolation ON client_tags FOR ALL
      USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- sensor_bindings
-- --------------------------------------------
-- sensor_bindings links a mac -> device_name for a tenant. The table may or may
-- not have client_id directly; if not, we fall back to join via client_tags.
-- Check your schema first. The following assumes client_id exists on sensor_bindings.
-- If not, wrap in a SECURITY DEFINER function that does the join.
ALTER TABLE sensor_bindings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sensor_bindings' AND policyname='sensor_bindings_isolation') THEN
    -- If sensor_bindings has no client_id column, swap this policy for the join-based one below.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='sensor_bindings' AND column_name='client_id'
    ) THEN
      CREATE POLICY sensor_bindings_isolation ON sensor_bindings FOR ALL
        USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id));
    ELSE
      -- Fallback: ownership via client_tags mapping on mac.
      CREATE POLICY sensor_bindings_isolation ON sensor_bindings FOR ALL
        USING (
          auth_is_superadmin() OR EXISTS (
            SELECT 1 FROM client_tags ct
            WHERE ct.mac = sensor_bindings.mac
              AND ct.client_id = auth_client_id()
          )
        )
        WITH CHECK (
          auth_is_superadmin() OR EXISTS (
            SELECT 1 FROM client_tags ct
            WHERE ct.mac = sensor_bindings.mac
              AND ct.client_id = auth_client_id()
          )
        );
    END IF;
  END IF;
END $$;

-- --------------------------------------------
-- sensor_data
-- --------------------------------------------
-- sensor_data is ingested per-mac without a direct client_id column (typical shape).
-- We derive ownership via client_tags; this policy is read-only for tenants —
-- INSERTs should continue going through the service_role on the ingest path.
ALTER TABLE sensor_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sensor_data' AND policyname='sensor_data_tenant_read') THEN
    CREATE POLICY sensor_data_tenant_read ON sensor_data FOR SELECT
      USING (
        auth_is_superadmin() OR EXISTS (
          SELECT 1 FROM client_tags ct
          WHERE ct.mac = sensor_data.mac
            AND ct.client_id = auth_client_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sensor_data' AND policyname='sensor_data_superadmin_write') THEN
    -- Only superadmin / service_role can write directly; ingest API stays on service key.
    CREATE POLICY sensor_data_superadmin_write ON sensor_data FOR ALL
      USING (auth_is_superadmin()) WITH CHECK (auth_is_superadmin());
  END IF;
END $$;

-- --------------------------------------------
-- usage_logs / usage_daily — read own tenant only
-- --------------------------------------------
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='usage_logs_tenant_read') THEN
    CREATE POLICY usage_logs_tenant_read ON usage_logs FOR SELECT
      USING (tenant_owns(client_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_daily' AND policyname='usage_daily_tenant_read') THEN
    CREATE POLICY usage_daily_tenant_read ON usage_daily FOR SELECT
      USING (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- audit_logs — read own tenant, write only via service_role
-- --------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_logs' AND policyname='audit_logs_tenant_read') THEN
    CREATE POLICY audit_logs_tenant_read ON audit_logs FOR SELECT
      USING (tenant_owns(client_id));
  END IF;
END $$;

-- --------------------------------------------
-- user_locations (Phase 4 mobile)
-- --------------------------------------------
-- user_locations has both user_id and client_id. Users can only read their own
-- positions; tenant admins (role in 'admin','operator') may read within tenant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='user_locations') THEN
    EXECUTE 'ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_locations' AND policyname='user_locations_isolation') THEN
      EXECUTE $POL$
        CREATE POLICY user_locations_isolation ON user_locations FOR ALL
          USING (
            auth_is_superadmin()
            OR (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'id')::uuid)
            OR (
              client_id = auth_client_id()
              AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role','') IN ('admin','operator')
            )
          )
          WITH CHECK (
            user_id = (current_setting('request.jwt.claims', true)::jsonb->>'id')::uuid
            AND client_id = auth_client_id()
          )
      $POL$;
    END IF;
  END IF;
END $$;

-- --------------------------------------------
-- report_schedules
-- --------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='report_schedules') THEN
    EXECUTE 'ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedules' AND policyname='report_schedules_isolation') THEN
      EXECUTE 'CREATE POLICY report_schedules_isolation ON report_schedules FOR ALL USING (tenant_owns(client_id)) WITH CHECK (tenant_owns(client_id))';
    END IF;
  END IF;
END $$;

COMMIT;

-- ============================================
-- Verification (run ad-hoc after applying):
--   SELECT schemaname, tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' ORDER BY tablename;
-- ============================================
