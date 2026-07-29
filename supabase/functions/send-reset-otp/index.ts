import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, otpEmailHtml } from "../_shared/resend.ts";
import { getNotificationSettings } from "../_shared/notificationSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shown = local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function maskPhone(tenDigits: string): string {
  return `+91 ***** ${tenDigits.slice(6)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return json({ error: "Enter a valid email address" }, 400);
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve the account by email
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, full_name, phone, is_active")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!profileRow) {
      return json({ error: "No account found for that email" }, 404);
    }
    if (profileRow.is_active === false) {
      return json({ error: "This account is inactive. Contact your admin." }, 403);
    }

    // Resolve one of the account's orgs (for org-specific sender settings, if any).
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", profileRow.id)
      .limit(1)
      .maybeSingle();
    const settings = await getNotificationSettings(supabase, membership?.org_id ?? null);

    // Rate limit: max 5 reset OTPs per email per hour
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase
      .from("public_otp_verifications")
      .select("*", { count: "exact", head: true })
      .eq("identifier", normalizedEmail)
      .eq("identifier_type", "reset_email")
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= 5) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }

    const otpCode = generateOtp();
    const { data: otpRecord, error: insertErr } = await supabase
      .from("public_otp_verifications")
      .insert({ identifier: normalizedEmail, identifier_type: "reset_email", otp_code: otpCode })
      .select("session_id")
      .single();
    if (insertErr || !otpRecord) {
      return json({ error: "Failed to create OTP" }, 500);
    }
    const sessionId = otpRecord.session_id;

    // Normalize phone to a 10-digit Indian mobile
    const cleanPhone = String(profileRow.phone || "").replace(/\D/g, "").slice(-10);
    const phoneValid = cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone);

    // ── WhatsApp via Exotel ──
    let waSent = false;
    if (phoneValid) {
      const exotelSid = settings.exotel_account_sid;
      const exotelApiKey = settings.exotel_api_key;
      const exotelApiToken = settings.exotel_api_token;
      const exotelDomain = settings.exotel_subdomain;
      const fromNumber = settings.exotel_sender_number;
      const toPhone = `91${cleanPhone}`;
      const exotelUrl = `https://${exotelApiKey}:${exotelApiToken}@${exotelDomain}/v2/accounts/${exotelSid}/messages`;
      const waPayload = {
        custom_data: toPhone,
        whatsapp: {
          messages: [{
            from: fromNumber,
            to: toPhone,
            content: {
              type: "template",
              template: {
                name: "otp",
                language: { code: "en" },
                components: [
                  { type: "body", parameters: [{ type: "text", text: otpCode }] },
                  { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otpCode }] },
                ],
              },
            },
          }],
        },
      };
      try {
        const waRes = await fetch(exotelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(waPayload),
        });
        if (!waRes.ok) console.error("Exotel WhatsApp error:", await waRes.text());
        else waSent = true;
      } catch (err) {
        console.error("Exotel fetch error:", err);
      }
    }

    // ── Email via Resend ──
    let emailSent = false;
    try {
      await sendEmail(
        {
          to: normalizedEmail,
          subject: `${otpCode} is your Expense Claims password reset code`,
          html: otpEmailHtml(otpCode, profileRow.full_name || normalizedEmail.split("@")[0], "reset"),
        },
        settings.resend_api_key,
        settings.from_email,
      );
      emailSent = true;
    } catch (err) {
      console.error("Resend error:", err);
    }

    if (!waSent && !emailSent) {
      return json({ error: "Failed to send OTP via any channel" }, 500);
    }

    return json({
      success: true,
      sessionId,
      channels: { whatsapp: waSent, email: emailSent },
      maskedEmail: maskEmail(normalizedEmail),
      maskedPhone: phoneValid ? maskPhone(cleanPhone) : null,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
