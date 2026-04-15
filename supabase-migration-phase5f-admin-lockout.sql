-- ============================================
-- Phase 5f: Admin account lockout + status columns
-- ============================================
-- Mirrors tenant_users lockout semantics on the admins table so the
-- superadmin login route can enforce:
--   * failed_login_count increment on each bad password
--   * locked_until = now() + 30m after 5 failures
--   * status = 'active' | 'disabled' for soft-deactivation
--   * last_login_at for audit visibility
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled'));

-- Query-path index: lockout enforcement reads locked_until on every login.
CREATE INDEX IF NOT EXISTS idx_admins_locked_until
  ON admins (locked_until)
  WHERE locked_until IS NOT NULL;

COMMIT;
