-- Migration: phase5d-scheduler-lock
-- Purpose: Atomic schedule claiming using SELECT FOR UPDATE SKIP LOCKED
-- This prevents duplicate report delivery when multiple server instances
-- run concurrently. Advisory locks are NOT used because Supabase REST API
-- uses connection pooling (pgBouncer in transaction mode), so each RPC call
-- may land on a different backend session — session-scoped advisory locks
-- would be released immediately. SKIP LOCKED is purely row-level and works
-- correctly inside a single transaction regardless of session.

CREATE OR REPLACE FUNCTION claim_due_schedule()
  RETURNS TABLE(
    id             UUID,
    name           TEXT,
    report_type    TEXT,
    frequency      TEXT,
    recipients     JSONB,
    run_at_hour    INT,
    run_at_minute  INT,
    day_of_week    INT,
    day_of_month   INT,
    timezone       TEXT,
    last_run_at    TIMESTAMPTZ,
    next_run_at    TIMESTAMPTZ
  )
  LANGUAGE plpgsql AS $$
DECLARE
  picked RECORD;
BEGIN
  -- Atomically pick the oldest due schedule that no other transaction is
  -- currently processing. SKIP LOCKED skips rows locked by other sessions,
  -- so concurrent instances each claim a distinct row (or get nothing).
  SELECT s.* INTO picked
  FROM report_schedules s
  WHERE s.enabled = true
    AND s.next_run_at <= now()
  ORDER BY s.next_run_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF picked IS NULL THEN
    RETURN;
  END IF;

  -- Advance next_run_at by 5 minutes as a placeholder so that other instances
  -- (or a future cron tick before this execution finishes) do not re-claim the
  -- same row. The actual next_run_at is overwritten by the Node.js process
  -- after the report is generated (both success and failure paths).
  UPDATE report_schedules
    SET next_run_at = now() + interval '5 minutes'
    WHERE report_schedules.id = picked.id;

  RETURN QUERY
    SELECT picked.id, picked.name, picked.report_type,
           picked.frequency, picked.recipients, picked.run_at_hour,
           picked.run_at_minute, picked.day_of_week, picked.day_of_month,
           picked.timezone, picked.last_run_at, picked.next_run_at;
END $$;
