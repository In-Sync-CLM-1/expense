/**
 * send-project-expense-notification
 *
 * Sends email notifications for RMPL Project Expense claim lifecycle events:
 *   - "submitted"   → email to the resolved Project Owner
 *   - "approved"    → email to the filer + every RMPL Accounts/Admin user
 *                     (their claim is now ready for payment)
 *   - "rejected"    → email to the filer
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
  .status-approved  { color:#16a34a; font-weight:700; }
  .status-rejected  { color:#dc2626; font-weight:700; }
  .status-submitted { color:#d97706; font-weight:700; }
  .status-reimbursed{ color:#7c3aed; font-weight:700; }
  .footer { background:#f8fafc; padding:20px 32px; font-size:12px; color:#94a3b8; text-align:center; border-top:1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Project Expense</h1>
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

function claimCard(claim: Record<string, unknown>): string {
  return `
    <div class="card">
      <div class="row"><span class="label">Traveller</span><span class="value">${claim.traveller_name}</span></div>
      <div class="row"><span class="label">Project</span><span class="value">${claim.project_name}${claim.project_number ? ` (${claim.project_number})` : ""}</span></div>
      <div class="row"><span class="label">Activity</span><span class="value">${claim.activity ?? "—"}</span></div>
      <div class="row"><span class="label">City</span><span class="value">${claim.city ?? "—"}</span></div>
      <div class="row"><span class="label">Advance Received</span><span class="value">${fmt(claim.advance_amount as number)}</span></div>
      <div class="row"><span class="label">Actual Expense</span><span class="value amount">${fmt(claim.actual_expense_total as number)}</span></div>
      <div class="row"><span class="label">Net Balance</span><span class="value">${fmt(claim.net_balance as number)}</span></div>
    </div>
  `;
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
      .from("project_expense_claims")
      .select(`
        *,
        filer:profiles!project_expense_claims_user_id_fkey(id, full_name, email),
        owner:profiles!project_expense_claims_project_owner_user_id_fkey(full_name, email)
      `)
      .eq("id", claim_id)
      .single();

    if (claimErr || !claim) {
      console.error("Project expense claim not found:", claimErr);
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await getNotificationSettings(supabase, (claim as { org_id?: string | null }).org_id ?? null);
    const resend = new Resend(settings.resend_api_key);
    const filer = claim.filer as { id: string; full_name: string; email: string };
    const owner = claim.owner as { full_name: string; email: string } | null;

    const recipients: { email: string; name: string }[] = [];
    let subject = "";
    let html = "";

    if (event === "submitted") {
      if (!owner?.email) {
        return new Response(JSON.stringify({ skipped: "no resolved project owner" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients.push({ email: owner.email, name: owner.full_name ?? "Project Owner" });
      subject = `Project Expense: ${claim.project_name} — ${filer.full_name} needs your approval`;
      html = baseTemplate("New project expense awaiting your approval", `
        <p>Hi <strong>${owner.full_name ?? "there"}</strong>,</p>
        <p><strong>${filer.full_name}</strong> has submitted a project expense claim on <strong>${claim.project_name}</strong> for your approval as Project Owner.</p>
        ${claimCard(claim as Record<string, unknown>)}
        <p>Please log in to review and approve or reject this claim.</p>
      `);
    } else if (event === "approved") {
      recipients.push({ email: filer.email, name: filer.full_name });
      const { data: accountsMembers } = await supabase
        .from("org_memberships")
        .select("profiles:user_id(full_name, email)")
        .eq("org_id", claim.org_id as string)
        .eq("is_active", true)
        .overlaps("roles", ["admin", "accounts"]);
      for (const m of (accountsMembers ?? []) as { profiles: { full_name: string; email: string } | null }[]) {
        if (m.profiles?.email) recipients.push({ email: m.profiles.email, name: m.profiles.full_name });
      }
      subject = `Project expense "${claim.project_name}" approved — ready for payment`;
      html = baseTemplate("Project expense approved", `
        <p>The project expense filed by <strong>${filer.full_name}</strong> has been <span class="status-approved">approved</span> by the Project Owner (${owner?.full_name ?? "—"}) and is now ready for Finance to process payment.</p>
        ${claimCard(claim as Record<string, unknown>)}
      `);
    } else if (event === "rejected") {
      recipients.push({ email: filer.email, name: filer.full_name });
      subject = `Your project expense "${claim.project_name}" has been rejected`;
      html = baseTemplate("Project expense rejected", `
        <p>Hi <strong>${filer.full_name}</strong>,</p>
        <p>Your project expense claim has been <span class="status-rejected">rejected</span> by ${owner?.full_name ?? "the Project Owner"}.</p>
        ${claimCard(claim as Record<string, unknown>)}
        <div class="card" style="border-color:#fecaca;background:#fef2f2;">
          <p style="margin:0;color:#dc2626;font-size:14px"><strong>Reason:</strong><br/>${claim.rejection_reason ?? "No reason provided."}</p>
        </div>
      `);
    } else if (event === "reimbursed") {
      recipients.push({ email: filer.email, name: filer.full_name });
      subject = `Your project expense "${claim.project_name}" has been paid`;
      html = baseTemplate("Project expense paid", `
        <p>Hi <strong>${filer.full_name}</strong>,</p>
        <p>Your project expense claim has been <span class="status-reimbursed">marked as paid</span> by Finance.</p>
        ${claimCard(claim as Record<string, unknown>)}
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

    console.log(`[send-project-expense-notification] ${event} → ${recipients.map((r) => r.email).join(", ")} (${result.data?.id})`);

    return new Response(JSON.stringify({ success: true, email_id: result.data?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-project-expense-notification] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
