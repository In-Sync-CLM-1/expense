import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Expense Claims <no-reply@example.com>";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmt(n: number): string {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { margin:0; background:#f0f4f8; font-family:'Nunito Sans',Arial,sans-serif; color:#1e293b; }
  .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#3b82f6,#1e3a8a); padding:28px 32px; }
  .header h1 { margin:0; color:#fff; font-size:20px; font-weight:700; }
  .header p  { margin:4px 0 0; color:#bfdbfe; font-size:14px; }
  .body   { padding:32px; }
  .body p { font-size:15px; line-height:1.6; margin:0 0 16px; }
  .card   { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin:20px 0; }
  .card .row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:14px; }
  .card .row:last-child { border-bottom:none; }
  .card .label { color:#64748b; }
  .card .value { font-weight:600; color:#1e293b; }
  .amount { font-size:24px; font-weight:800; color:#3b82f6; }
  .status-approved { color:#16a34a; font-weight:700; }
  .status-rejected { color:#dc2626; font-weight:700; }
  .footer { background:#f8fafc; padding:20px 32px; font-size:12px; color:#94a3b8; text-align:center; border-top:1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Expense Claims</h1>
    <p>${title}</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">This is an automated notification. Please do not reply to this email.</div>
</div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { advance_request_id } = await req.json();
    if (!advance_request_id) {
      return jsonResponse({ error: "advance_request_id is required" }, 400);
    }

    const { data: request, error: reqErr } = await admin
      .from("expense_advance_requests")
      .select("id, user_id, amount, purpose, status, project_name, review_comments")
      .eq("id", advance_request_id)
      .single();
    if (reqErr || !request) {
      return jsonResponse({ error: "Advance request not found" }, 404);
    }
    if (request.status === "pending") {
      return jsonResponse({ error: "This request hasn't been decided yet" }, 400);
    }

    const { data: maker } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", request.user_id)
      .single();
    if (!maker?.email) {
      return jsonResponse({ skipped: "maker has no email" });
    }

    const approved = request.status === "approved";
    const amountText = fmt(Number(request.amount));
    const title = approved
      ? `Advance request approved: ${amountText}`
      : `Advance request not approved: ${amountText}`;

    const body = `
      <p>Hi <strong>${maker.full_name ?? "there"}</strong>,</p>
      <p>Your advance request has been <span class="${approved ? "status-approved" : "status-rejected"}">${approved ? "approved" : "not approved"}</span>.</p>
      <div class="card">
        <div class="row"><span class="label">Amount</span><span class="value amount">${amountText}</span></div>
        <div class="row"><span class="label">Purpose</span><span class="value">${request.purpose}</span></div>
        ${approved && request.project_name ? `<div class="row"><span class="label">Project</span><span class="value">${request.project_name}</span></div>` : ""}
      </div>
      ${
        approved
          ? `<p>Accounts will process the disbursement.</p>`
          : `<div class="card" style="border-color:#fecaca;background:#fef2f2;"><p style="margin:0;color:#dc2626;font-size:14px"><strong>Reason:</strong><br/>${request.review_comments ?? "No reason provided."}</p></div>`
      }
    `;

    const resend = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [maker.email],
        subject: `${title} - Expense Claims`,
        html: baseTemplate(approved ? "Your advance request has been approved" : "Your advance request was not approved", body),
      }),
    });

    if (!resend.ok) {
      console.error("Advance decision email failed:", await resend.text());
      return jsonResponse({ success: false, email_sent: false });
    }

    return jsonResponse({ success: true, email_sent: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("notify-advance-decision failed:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
