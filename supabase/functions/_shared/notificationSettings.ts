// Shared module: resolves per-org WhatsApp/email sending settings, with a
// fallback to the single global default row (org_id IS NULL) for every org
// that doesn't have its own. Never remove the fallback — every org without
// a dedicated row depends on it.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface NotificationSettings {
  exotel_account_sid: string;
  exotel_api_key: string;
  exotel_api_token: string;
  exotel_subdomain: string;
  exotel_sender_number: string;
  resend_api_key: string;
  from_email: string;
}

const SELECT_COLUMNS =
  "exotel_account_sid, exotel_api_key, exotel_api_token, exotel_subdomain, exotel_sender_number, resend_api_key, from_email";

// deno-lint-ignore no-explicit-any
export async function getNotificationSettings(
  admin: SupabaseClient,
  orgId: string | null | undefined,
): Promise<NotificationSettings> {
  if (orgId) {
    const { data } = await admin
      .from("org_notification_settings")
      .select(SELECT_COLUMNS)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data as NotificationSettings;
  }

  const { data: fallback } = await admin
    .from("org_notification_settings")
    .select(SELECT_COLUMNS)
    .is("org_id", null)
    .eq("is_active", true)
    .maybeSingle();

  if (!fallback) {
    throw new Error("No default notification settings configured");
  }
  return fallback as NotificationSettings;
}
