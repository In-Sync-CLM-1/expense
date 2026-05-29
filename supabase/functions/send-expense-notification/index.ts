/**
 * send-expense-notification
 *
 * Sends email notifications for expense claim lifecycle events:
 *   - "submitted"   → email to the employee's manager
 *   - "approved"    → email to the employee
 *   - "rejected"    → email to the employee
 *   - "reimbursed"  → email to the employee
 *
 * Environment variables required:
 *   SUPABASE_URL           – project URL
 *   SUPABASE_SERVICE_ROLE_KEY – service-role key (read full claim + profiles)
 *   RESEND_API_KEY         – Resend.com API key
 *   FROM_EMAIL             – sender address (e.g. "Expense System <no-reply@yourcompany.com>")
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders } from "../_shared/cors-headers.ts";

const FROM_EMAIL =
  Deno.env.get("FROM_EMAIL") ?? "Expense Claims <no-reply@example.com>";

// ─── Email HTML templates ─────────────────────────────────────────────────────

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
  .btn  { display:inline-block; background:#3b82f6; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:700; font-size:15px; margin-top:8px; }
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

function fmt(n: number | null): string {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Template: claim submitted → notify manager ───────────────────────────────

function submittedEmail(
  managerName: string,
  employeeName: string,
  claim: Record<string, unknown>
): string {
  const body = `
    <p>Hi <strong>${managerName}</strong>,</p>
    <p><strong>${employeeName}</strong> has submitted an expense claim for your approval.</p>
    <div class="card">
      <div class="row"><span class="label">Trip</span><span class="value">${claim.trip_title}</span></div>
      <div class="row"><span class="label">Destination</span><span class="value">${claim.destination ?? "—"}</span></div>
      <div class="row"><span class="label">Travel Dates</span><span class="value">${fmtDate(claim.trip_start_date as string)} – ${fmtDate(claim.trip_end_date as string)}</span></div>
      <div class="row"><span class="label">Purpose</span><span class="value">${claim.purpose ?? "—"}</span></div>
      <div class="row"><span class="label">Total Claimed</span><span class="value amount">${fmt(claim.total_amount as number)}</span></div>
      <div class="row"><span class="label">Submitted On</span><span class="value">${fmtDate(claim.submitted_at as string)}</span></div>
    </div>
    <p>Please log in to review and approve or reject this claim.</p>
  `;
  return baseTemplate("New expense claim awaiting your approval", body);
}

// ─── Template: claim approved → notify employee ───────────────────────────────

function approvedEmail(
  employeeName: string,
  approverName: string,
  claim: Record<string, unknown>
): string {
  const approvedAmount = claim.approved_amount as number | null;
  const totalAmount = claim.total_amount as number;
  const partial = approvedAmount != null && approvedAmount < totalAmount;

  const body = `
    <p>Hi <strong>${employeeName}</strong>,</p>
    <p>Your expense claim has been <span class="status-approved">${partial ? "partially approved" : "approved"}</span> by <strong>${approverName}</strong>.</p>
    <div class="card">
      <div class="row"><span class="label">Trip</span><span class="value">${claim.trip_title}</span></div>
      <div class="row"><span class="label">Destination</span><span class="value">${claim.destination ?? "—"}</span></div>
      <div class="row"><span class="label">Amount Claimed</span><span class="value">${fmt(totalAmount)}</span></div>
      <div class="row"><span class="label">Amount Approved</span><span class="value amount">${fmt(approvedAmount ?? totalAmount)}</span></div>
      <div class="row"><span class="label">Approved On</span><span class="value">${fmtDate(claim.approved_at as string)}</span></div>
    </div>
    ${partial ? `<p style="color:#d97706">Note: Only a partial amount was approved. Please contact your manager for details.</p>` : ""}
    <p>Your claim will be reimbursed as per company policy.</p>
  `;
  return baseTemplate("Your expense claim has been approved", body);
}

// ─── Template: claim rejected → notify employee ───────────────────────────────

function rejectedEmail(
  employeeName: string,
  approverName: string,
  claim: Record<string, unknown>
): string {
  const body = `
    <p>Hi <strong>${employeeName}</strong>,</p>
    <p>Your expense claim has been <span class="status-rejected">rejected</span> by <strong>${approverName}</strong>.</p>
    <div class="card">
      <div class="row"><span class="label">Trip</span><span class="value">${claim.trip_title}</span></div>
      <div class="row"><span class="label">Amount Claimed</span><span class="value">${fmt(claim.total_amount as number)}</span></div>
      <div class="row"><span class="label">Rejected On</span><span class="value">${fmtDate(claim.approved_at as string)}</span></div>
    </div>
    <div class="card" style="border-color:#fecaca;background:#fef2f2;">
      <p style="margin:0;color:#dc2626;font-size:14px"><strong>Reason for Rejection:</strong><br/>${claim.rejection_reason ?? "No reason provided."}</p>
    </div>
    <p>You may revise and resubmit your claim. Please contact your manager if you have questions.</p>
  `;
  return baseTemplate("Your expense claim has been rejected", body);
}

// ─── Template: claim reimbursed → notify employee ─────────────────────────────

function reimbursedEmail(
  employeeName: string,
  claim: Record<string, unknown>
): string {
  const body = `
    <p>Hi <strong>${employeeName}</strong>,</p>
    <p>Your expense claim has been <span class="status-reimbursed">reimbursed</span>!</p>
    <div class="card">
      <div class="row"><span class="label">Trip</span><span class="value">${claim.trip_title}</span></div>
      <div class="row"><span class="label">Reimbursed Amount</span><span class="value amount">${fmt((claim.approved_amount ?? claim.total_amount) as number)}</span></div>
      <div class="row"><span class="label">Reimbursed On</span><span class="value">${fmtDate(claim.reimbursed_at as string)}</span></div>
    </div>
    <p>The amount should reflect in your account as per company reimbursement timelines.</p>
  `;
  return baseTemplate("Your expense has been reimbursed", body);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { event, claim_id } = await req.json();

    if (!claim_id || !event) {
      return new Response(
        JSON.stringify({ error: "claim_id and event are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch claim with profiles joined
    const { data: claim, error: claimErr } = await supabase
      .from("travel_expense_claims")
      .select(`
        *,
        employee:profiles!travel_expense_claims_user_id_fkey(id, full_name, email, reports_to),
        approver:profiles!travel_expense_claims_approved_by_fkey(full_name, email)
      `)
      .eq("id", claim_id)
      .single();

    if (claimErr || !claim) {
      console.error("Claim not found:", claimErr);
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendKey);
    const employee = claim.employee as { id: string; full_name: string; email: string; reports_to: string | null };
    const approver = claim.approver as { full_name: string; email: string } | null;

    let toEmail: string;
    let toName: string;
    let subject: string;
    let html: string;

    if (event === "submitted") {
      // Notify manager
      if (!employee.reports_to) {
        console.log("No manager set for employee, skipping notification");
        return new Response(
          JSON.stringify({ skipped: "no manager" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: manager } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", employee.reports_to)
        .single();

      if (!manager?.email) {
        return new Response(
          JSON.stringify({ skipped: "manager has no email" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      toEmail = manager.email;
      toName = manager.full_name ?? "Manager";
      subject = `Expense Claim: ${claim.trip_title} — ${employee.full_name} needs your approval`;
      html = submittedEmail(toName, employee.full_name, claim as unknown as Record<string, unknown>);

    } else if (event === "approved") {
      toEmail = employee.email;
      toName = employee.full_name;
      subject = `Your expense claim "${claim.trip_title}" has been approved`;
      html = approvedEmail(
        employee.full_name,
        approver?.full_name ?? "Your Manager",
        claim as unknown as Record<string, unknown>
      );

    } else if (event === "rejected") {
      toEmail = employee.email;
      toName = employee.full_name;
      subject = `Your expense claim "${claim.trip_title}" has been rejected`;
      html = rejectedEmail(
        employee.full_name,
        approver?.full_name ?? "Your Manager",
        claim as unknown as Record<string, unknown>
      );

    } else if (event === "reimbursed") {
      toEmail = employee.email;
      toName = employee.full_name;
      subject = `Your expense "${claim.trip_title}" has been reimbursed`;
      html = reimbursedEmail(employee.full_name, claim as unknown as Record<string, unknown>);

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown event: ${event}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject,
      html,
    });

    if (result.error) {
      console.error("Resend error:", result.error);
      throw new Error(result.error.message);
    }

    console.log(`[send-expense-notification] ${event} → ${toEmail} (${result.data?.id})`);

    return new Response(
      JSON.stringify({ success: true, email_id: result.data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-expense-notification] error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
