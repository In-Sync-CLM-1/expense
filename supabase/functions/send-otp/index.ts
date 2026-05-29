import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, otpEmailHtml } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, email, name } = await req.json();

    // Validate phone: 10-digit Indian mobile
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone)) {
      return json({ error: "Invalid mobile number (must be 10-digit Indian number)" }, 400);
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }

    const normalizedPhone = `+91${cleanPhone}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: max 5 OTPs per phone per hour
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase
      .from("public_otp_verifications")
      .select("*", { count: "exact", head: true })
      .eq("identifier", normalizedPhone)
      .gte("created_at", oneHourAgo);

    if ((count || 0) >= 5) {
      return json({ error: "Too many requests. Try again later." }, 429);
    }

    // Generate and store one OTP (linked to phone identifier)
    const otpCode = generateOtp();
    const { data: otpRecord, error: insertErr } = await supabase
      .from("public_otp_verifications")
      .insert({ identifier: normalizedPhone, identifier_type: "phone", otp_code: otpCode })
      .select("session_id")
      .single();

    if (insertErr || !otpRecord) {
      return json({ error: "Failed to create OTP" }, 500);
    }

    const sessionId = otpRecord.session_id;

    // ── Send WhatsApp via Exotel ──────────────────────────────────────────
    const exotelSid      = Deno.env.get("EXOTEL_ACCOUNT_SID")!;
    const exotelApiKey   = Deno.env.get("EXOTEL_API_KEY")!;
    const exotelApiToken = Deno.env.get("EXOTEL_API_TOKEN")!;
    const exotelDomain   = Deno.env.get("EXOTEL_SUBDOMAIN") || "api.exotel.com";
    const fromNumber     = Deno.env.get("EXOTEL_SENDER_NUMBER") || "919540178308";

    const toPhone = `91${cleanPhone}`;
    const exotelUrl = `https://${exotelApiKey}:${exotelApiToken}@${exotelDomain}/v2/accounts/${exotelSid}/messages`;

    const waPayload = {
      custom_data: toPhone,
      whatsapp: {
        messages: [
          {
            from: fromNumber,
            to: toPhone,
            content: {
              type: "template",
              template: {
                name: "otp",
                language: { code: "en" },
                components: [
                  {
                    type: "body",
                    parameters: [{ type: "text", text: otpCode }],
                  },
                  {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [{ type: "text", text: otpCode }],
                  },
                ],
              },
            },
          },
        ],
      },
    };

    let waSent = false;
    try {
      const waRes = await fetch(exotelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waPayload),
      });
      if (!waRes.ok) {
        const errText = await waRes.text();
        console.error("Exotel WhatsApp error:", errText);
      } else {
        waSent = true;
      }
    } catch (err) {
      console.error("Exotel fetch error:", err);
    }

    // ── Send Email via Resend ─────────────────────────────────────────────
    let emailSent = false;
    try {
      await sendEmail({
        to: email,
        subject: `${otpCode} is your Expense Claims OTP`,
        html: otpEmailHtml(otpCode, name || email.split("@")[0]),
      });
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
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
