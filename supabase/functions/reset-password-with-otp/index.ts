import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, otp, newPassword } = await req.json();
    if (!sessionId || !otp) return json({ error: "sessionId and otp are required" }, 400);
    if (!newPassword || String(newPassword).length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the reset OTP: unverified, unexpired, right type
    const { data: record, error: fetchErr } = await supabase
      .from("public_otp_verifications")
      .select("*")
      .eq("session_id", sessionId)
      .eq("identifier_type", "reset_email")
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (fetchErr || !record) return json({ error: "OTP expired or invalid" }, 400);
    if (record.attempts >= record.max_attempts) {
      return json({ error: "Too many attempts. Request a new OTP." }, 400);
    }
    if (record.otp_code !== String(otp)) {
      await supabase
        .from("public_otp_verifications")
        .update({ attempts: record.attempts + 1 })
        .eq("id", record.id);
      return json({ error: "Incorrect OTP" }, 400);
    }

    // Resolve the account this OTP was issued for
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", record.identifier)
      .maybeSingle();
    if (!profileRow) return json({ error: "Account not found" }, 404);

    // Set the new password
    const { error: updErr } = await supabase.auth.admin.updateUserById(profileRow.id, {
      password: String(newPassword),
    });
    if (updErr) return json({ error: updErr.message }, 500);

    // Consume the OTP so it can't be replayed
    await supabase
      .from("public_otp_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", record.id);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
