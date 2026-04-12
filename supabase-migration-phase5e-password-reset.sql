-- Phase 5e: Password Reset & Invite Accept Flow
-- Migration: Add reset_token fields to tenant_users

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_users_reset_token
  ON tenant_users (reset_token)
  WHERE reset_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_users_invite_token
  ON tenant_users (invite_token)
  WHERE invite_token IS NOT NULL;
