-- Per-org WhatsApp (Exotel) and email (Resend) sending settings, with a
-- single global fallback row (org_id IS NULL) for every org that doesn't
-- have its own. Previously these credentials were hardcoded as global
-- Supabase secrets, shared across every organization with no way to give
-- one org its own sender number or from-address.
CREATE TABLE IF NOT EXISTS org_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  exotel_account_sid text NOT NULL,
  exotel_api_key text NOT NULL,
  exotel_api_token text NOT NULL,
  exotel_subdomain text NOT NULL DEFAULT 'api.exotel.com',
  exotel_sender_number text NOT NULL,
  resend_api_key text NOT NULL,
  from_email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one active default (global) row.
CREATE UNIQUE INDEX IF NOT EXISTS org_notification_settings_one_default
  ON org_notification_settings ((org_id IS NULL))
  WHERE org_id IS NULL AND is_active = true;

-- At most one active row per org.
CREATE UNIQUE INDEX IF NOT EXISTS org_notification_settings_one_per_org
  ON org_notification_settings (org_id)
  WHERE org_id IS NOT NULL AND is_active = true;

-- Locked down: these are live send credentials. Only the service role
-- (used exclusively by edge functions) may ever read or write this table —
-- no anon/authenticated policy is added on purpose.
ALTER TABLE org_notification_settings ENABLE ROW LEVEL SECURITY;
