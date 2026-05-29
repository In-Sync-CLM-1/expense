// Shared module: sends email via Resend HTTP API

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ id: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "expenses@in-sync.co.in";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `Expense Claims <${FROM_EMAIL}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Resend API error: ${JSON.stringify(data)}`);
  }
  return data;
}

export function otpEmailHtml(otp: string, name: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#3b82f6;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Expense Claims</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;color:#18181b;font-size:20px;">Verify your email</h2>
          <p style="color:#52525b;font-size:15px;line-height:1.6;margin:0 0 8px;">
            Hi ${name}, use the OTP below to complete your registration.
          </p>
          <p style="color:#a1a1aa;font-size:13px;margin:0 0 24px;">This code expires in 5 minutes.</p>
          <div style="background:#f4f4f5;border-radius:10px;padding:20px;text-align:center;margin:0 0 24px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#18181b;font-family:monospace;">${otp}</span>
          </div>
          <p style="color:#a1a1aa;font-size:13px;line-height:1.5;margin:0;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;">
          <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">Expense Claims &mdash; in-sync.co.in</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
