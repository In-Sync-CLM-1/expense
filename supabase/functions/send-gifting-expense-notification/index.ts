/**
 * send-gifting-expense-notification
 *
 * Email notifications for Gifting Expense claim lifecycle events:
 *   - "submitted"   → email to every RMPL Accounts/Admin user (no approval
 *                     step — this claim is already ready for payment)
 *   - "reimbursed"  → email to the filer
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders } from "../_shared/cors-headers.ts";
import { getNotificationSettings } from "../_shared/notificationSettings.ts";

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { margin:0; background:#f0f4f8; font-family:'Nunito Sans',Arial,sans-serif; color:#1e293b; }
  .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#d946ef,#7c3aed); padding:28px 32px; }
  .header h1 { margin:0; color:#fff; font-size:20px; font-weight:700; }
  .header p  { margin:4px 0 0; color:#f3e8ff; font-size:14px; }
  .body   { padding:32px; }
  .body p { font-size:15px; line-height:1.6; margin:0 0 16px; }
  .card   { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin:20px 0; }
  .card .row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:14px; }
  .card .row:last-child { border-bottom:none; }
  .card .label { color:#64748b; }
  .card .value { font-weight:600; color:#1e293b; }
  .amount { font-size:24px; font-weight:800; color:#7c3aed; }
  .status-submitted { color:#d97706; font-weight:700; }
  .status-reimbursed{ color:#7c3aed; font-weight:700; }
  .footer { background:#f8fafc; padding:20px 32px; font-size:12px; color:#94a3b8; text-align:center; border-top:1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Gifting Expense</h1>
    <p>${title}</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">This is an automated notification. Please do not reply to this email.</div>
</div>
</body>
</html>`;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { event, claim_id } = await req.json();
    if (!claim_id || !event) {
      return new Response(JSON.stringify({ error: "claim_id and event are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: claim, error: claimErr } = await supabase
      .from("gifting_expense_claims")
      .select(`*, filer:profiles!gifting_expense_claims_user_id_fkey(id, full_name, email)`)
      .eq("id", claim_id)
      .single();

    if (claimErr || !claim) {
      console.error("Gifting expense claim not found:", claimErr);
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await getNotificationSettings(supabase, (claim as { org_id?: string | null }).org_id ?? null);
    const resend = new Resend(settings.resend_api_key);
    const filer = claim.filer as { id: string; full_name: string; email: string };

    const recipients: { email: string; name: string }[] = [];
    let subject = "";
    let html = "";

    const claimCard = `
      <div class="card">
        <div class="row"><span class="label">Filed by</span><span class="value">${filer.full_name}</span></div>
        <div class="row"><span class="label">Period</span><span class="value">${claim.period ?? "—"}</span></div>
        <div class="row"><span class="label">Total</span><span class="value amount">${fmt(claim.total_amount as number)}</span></div>
      </div>
    `;

    if (event === "submitted") {
      const { data: accountsMembers } = await supabase
        .from("org_memberships")
        .select("profiles:user_id(full_name, email)")
        .eq("org_id", claim.org_id as string)
        .eq("is_active", true)
        .overlaps("roles", ["admin", "accounts"]);
      for (const m of (accountsMembers ?? []) as { profiles: { full_name: string; email: string } | null }[]) {
        if (m.profiles?.email) recipients.push({ email: m.profiles.email, name: m.profiles.full_name });
      }
      subject = `Gifting expense from ${filer.full_name} — ready for payment`;
      html = baseTemplate("Gifting expense ready for payment", `
        <p>A gifting expense claim by <strong>${filer.full_name}</strong> spans multiple projects and has been submitted directly for payment — there's no per-project approval step for this claim type.</p>
        ${claimCard}
        <p>Each project's share has already been recorded against that project in RMPL. Please process payment to the filer.</p>
      `);
    } else if (event === "reimbursed") {
      recipients.push({ email: filer.email, name: filer.full_name });
      subject = `Your gifting expense claim has been paid`;
      html = baseTemplate("Gifting expense paid", `
        <p>Hi <strong>${filer.full_name}</strong>,</p>
        <p>Your gifting expense claim has been <span class="status-reimbursed">marked as paid</span> by Finance.</p>
        ${claimCard}
      `);
    } else {
      return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await resend.emails.send({
      from: settings.from_email,
      to: recipients.map((r) => r.email),
      subject,
      html,
    });

    if (result.error) {
      console.error("Resend error:", result.error);
      throw new Error(result.error.message);
    }

    console.log(`[send-gifting-expense-notification] ${event} → ${recipients.map((r) => r.email).join(", ")} (${result.data?.id})`);

    return new Response(JSON.stringify({ success: true, email_id: result.data?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-gifting-expense-notification] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
