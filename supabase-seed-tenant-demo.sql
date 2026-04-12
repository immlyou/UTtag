-- ============================================
-- Demo Tenant Seed: account-based data separation
-- ============================================
-- Apply AFTER:
--   1. supabase-schema.sql        (base schema + role_permissions seed)
--   2. supabase-migration-phase5-industry.sql (industry column + defaults)
--
-- Creates two demo tenants with 3 bound tags each and a handful of
-- recent sensor rows so the tenant.html dashboard has something to show.
--
-- All demo passwords: "demopass"  (bcrypt hash below)
-- If you need a different password, generate via:
--   node -e "require('bcryptjs').hash('YOUR_PASS',10).then(console.log)"
--
-- Safe to re-run: ON CONFLICT DO NOTHING / DO UPDATE guards everywhere.

BEGIN;

-- Known hash for "demopass" (bcryptjs, cost 10). Re-run-safe.
-- Generated locally; do NOT ship to production with this password.
--   $2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO

-- --------------------------------------------
-- 1. Two demo clients (different industries, different tiers)
-- --------------------------------------------
INSERT INTO clients (id, name, email, company, tier, industry, max_tags, max_keys)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   '冷鏈 Demo 客戶', 'coldchain-demo@uttag.local', 'ColdChain Demo Co.',
   'pro', 'cold_chain', 50, 5),
  ('22222222-2222-2222-2222-222222222222',
   '生醫 Demo 客戶', 'biomed-demo@uttag.local', 'BioMed Demo Co.',
   'pro', 'biomedical', 50, 5)
ON CONFLICT (email) DO UPDATE SET
  industry = EXCLUDED.industry,
  tier     = EXCLUDED.tier,
  name     = EXCLUDED.name;

-- --------------------------------------------
-- 2. Tenant users — 1 admin + 1 operator per client
-- --------------------------------------------
INSERT INTO tenant_users (client_id, email, name, password_hash, role, status)
VALUES
  -- Cold chain tenant
  ('11111111-1111-1111-1111-111111111111',
   'admin@coldchain.demo',    '冷鏈管理員', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'admin',    'active'),
  ('11111111-1111-1111-1111-111111111111',
   'operator@coldchain.demo', '冷鏈操作員', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'operator', 'active'),
  -- Biomedical tenant
  ('22222222-2222-2222-2222-222222222222',
   'admin@biomed.demo',    '生醫管理員', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'admin',    'active'),
  ('22222222-2222-2222-2222-222222222222',
   'operator@biomed.demo', '生醫操作員', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'operator', 'active'),
  -- "user" role = viewer (read-only, minimal field visibility)
  ('11111111-1111-1111-1111-111111111111',
   'viewer@coldchain.demo', '冷鏈檢視者', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'user', 'active'),
  ('22222222-2222-2222-2222-222222222222',
   'viewer@biomed.demo',    '生醫檢視者', '$2b$10$6Ed9/1nAaid2sPNOrWi6.OEqNzm9E5JBHqhDk9akB6mR5MGZqqivO',
   'user', 'active')
ON CONFLICT (client_id, email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  status        = 'active';

-- --------------------------------------------
-- 3. Bound tags per tenant (distinct MAC prefixes so they don't collide)
-- --------------------------------------------
INSERT INTO client_tags (client_id, mac, label)
VALUES
  -- Cold chain: CC:xx
  ('11111111-1111-1111-1111-111111111111', 'CC:00:00:00:00:01', '冷凍車 A'),
  ('11111111-1111-1111-1111-111111111111', 'CC:00:00:00:00:02', '冷凍車 B'),
  ('11111111-1111-1111-1111-111111111111', 'CC:00:00:00:00:03', '冷凍倉 1'),
  -- Biomedical: BM:xx
  ('22222222-2222-2222-2222-222222222222', 'BM:00:00:00:00:01', '疫苗冰箱 A'),
  ('22222222-2222-2222-2222-222222222222', 'BM:00:00:00:00:02', '疫苗冰箱 B'),
  ('22222222-2222-2222-2222-222222222222', 'BM:00:00:00:00:03', '運輸箱 #7')
ON CONFLICT (client_id, mac) DO UPDATE SET label = EXCLUDED.label;

-- --------------------------------------------
-- 4. A few fresh sensor readings so latest_data / status light up
-- --------------------------------------------
INSERT INTO sensor_data (mac, temperature, humidity, source, created_at) VALUES
  ('CC:00:00:00:00:01',  4.1, 68, 'seed', now() - interval '2 minutes'),
  ('CC:00:00:00:00:02',  5.3, 70, 'seed', now() - interval '3 minutes'),
  ('CC:00:00:00:00:03', -18.5, 55, 'seed', now() - interval '12 minutes'),
  ('BM:00:00:00:00:01',  5.0, 40, 'seed', now() - interval '1 minutes'),
  ('BM:00:00:00:00:02',  4.7, 42, 'seed', now() - interval '4 minutes'),
  ('BM:00:00:00:00:03',  6.8, 38, 'seed', now() - interval '45 minutes');

COMMIT;

-- ============================================
-- Verify:
--   SELECT c.name, c.industry, COUNT(ct.id) AS tags
--   FROM clients c LEFT JOIN client_tags ct ON ct.client_id = c.id
--   WHERE c.email LIKE '%@uttag.local' GROUP BY c.id;
--
-- Login accounts (all password = "demopass"):
--   admin@coldchain.demo     (cold_chain, admin    — sees all fields)
--   operator@coldchain.demo  (cold_chain, operator — limited fields)
--   viewer@coldchain.demo    (cold_chain, user     — minimal fields, no email/phone)
--   admin@biomed.demo        (biomedical, admin)
--   operator@biomed.demo     (biomedical, operator)
--   viewer@biomed.demo       (biomedical, user)
-- ============================================
