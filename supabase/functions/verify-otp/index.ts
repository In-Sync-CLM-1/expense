import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const { sessionId, otp } = await req.json();

    if (!sessionId || !otp) {
      return json({ error: "sessionId and otp are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the OTP record: must be unverified and not expired
    const { data: record, error: fetchErr } = await supabase
      .from("public_otp_verifications")
      .select("*")
      .eq("session_id", sessionId)
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (fetchErr || !record) {
      return json({ error: "OTP expired or invalid" }, 400);
    }

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

    // Mark as verified
    await supabase
      .from("public_otp_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", record.id);

    return json({ verified: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
