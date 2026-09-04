import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

// Pushes a submitted Gifting Expense claim into RMPL's own
// project_expense_submissions — one row per project the claim touches,
// category "Gifting & Merchandise" — so it counts toward that project's
// A-factor exactly like a submission made directly inside RMPL's
// Project Expenses tab. RMPL's A-factor math needs no changes: it already
// sums this table per project, this just adds another source of rows.
//
// Idempotent: each pushed row carries external_ref =
// "expense-gifting:<claim_id>:<rmpl_project_id>", checked before insert,
// so re-invoking (a retry, or reopening an already-synced claim) can
// never double-count. Once every project group is written, the claim's
// synced_to_rmpl_at is stamped and further calls are a no-op.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ClaimItem {
  id: string;
  line_date: string;
  rmpl_project_id: string;
  project_number: string | null;
  project_name: string;
  recipient: string | null;
  description: string;
  amount: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rmplUrl = Deno.env.get("RMPL_URL");
    const rmplKey = Deno.env.get("RMPL_SERVICE_ROLE_KEY");
    if (!rmplUrl || !rmplKey) {
      return jsonResponse({ error: "RMPL connection is not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { claim_id } = await req.json();
    if (!claim_id) {
      return jsonResponse({ error: "claim_id is required" }, 400);
    }

    const { data: claim, error: claimErr } = await admin
      .from("gifting_expense_claims")
      .select("id, user_id, filer_name, period, status, synced_to_rmpl_at")
      .eq("id", claim_id)
      .single();
    if (claimErr || !claim) {
      return jsonResponse({ error: "Claim not found" }, 404);
    }
    if (claim.status === "draft") {
      return jsonResponse({ error: "Claim is still a draft" }, 400);
    }
    if (claim.synced_to_rmpl_at) {
      return jsonResponse({ success: true, skipped: "already synced" });
    }

    const { data: items, error: itemsErr } = await admin
      .from("gifting_expense_claim_items")
      .select("id, line_date, rmpl_project_id, project_number, project_name, recipient, description, amount")
      .eq("claim_id", claim_id);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      return jsonResponse({ error: "Claim has no line items" }, 400);
    }

    // Resolve the filer's RMPL profile id by email, so the pushed
    // submissions show a real "submitted_by" in RMPL, same as
    // list-rmpl-projects resolves a project owner the other direction.
    let rmplSubmittedBy: string | null = null;
    const { data: filerProfile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", claim.user_id)
      .maybeSingle();
    if (filerProfile?.email) {
      const ownerParams = new URLSearchParams({
        select: "id,email",
        email: `eq.${filerProfile.email}`,
        limit: "1",
      });
      const ownerRes = await fetch(`${rmplUrl}/rest/v1/profiles?${ownerParams.toString()}`, {
        headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
      });
      if (ownerRes.ok) {
        const rows = await ownerRes.json() as { id: string }[];
        rmplSubmittedBy = rows[0]?.id ?? null;
      }
    }

    const byProject = new Map<string, ClaimItem[]>();
    for (const item of items as ClaimItem[]) {
      const list = byProject.get(item.rmpl_project_id) ?? [];
      list.push(item);
      byProject.set(item.rmpl_project_id, list);
    }

    let synced = 0;
    let skipped = 0;
    for (const [projectId, projectItems] of byProject) {
      const externalRef = `expense-gifting:${claim_id}:${projectId}`;

      const existsParams = new URLSearchParams({
        select: "id",
        external_ref: `eq.${externalRef}`,
        limit: "1",
      });
      const existsRes = await fetch(`${rmplUrl}/rest/v1/project_expense_submissions?${existsParams.toString()}`, {
        headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
      });
      if (existsRes.ok) {
        const existing = await existsRes.json() as { id: string }[];
        if (existing.length > 0) { skipped++; continue; }
      }

      const subtotal = projectItems.reduce((sum, it) => sum + Number(it.amount), 0);
      const summary = {
        categories: [{
          name: "Gifting & Merchandise",
          items: projectItems.map((it) => ({
            description: it.description || it.recipient || "Gifting expense",
            vendor: it.recipient || undefined,
            amount: Number(it.amount),
          })),
          subtotal,
        }],
        grand_total: subtotal,
        total_gst: 0,
        narrative: `Synced from Expense app — Gifting claim filed by ${claim.filer_name}${claim.period ? ` (${claim.period})` : ""}.`,
        currency: "INR",
      };

      const insertRes = await fetch(`${rmplUrl}/rest/v1/project_expense_submissions`, {
        method: "POST",
        headers: {
          apikey: rmplKey,
          Authorization: `Bearer ${rmplKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          project_id: projectId,
          expense_category: ["Gifting & Merchandise"],
          ai_summary: summary,
          total_amount: subtotal,
          submitted_by: rmplSubmittedBy,
          excel_filename: `Gifting Expense — ${claim.filer_name}${claim.period ? ` (${claim.period})` : ""}`,
          external_ref: externalRef,
          external_source: "expense-app:gifting_expense_claims",
        }),
      });
      if (!insertRes.ok) {
        console.error("RMPL insert failed:", insertRes.status, await insertRes.text());
        return jsonResponse({ error: `Could not push project ${projectId} into RMPL` }, 502);
      }
      synced++;
    }

    await admin
      .from("gifting_expense_claims")
      .update({ synced_to_rmpl_at: new Date().toISOString() })
      .eq("id", claim_id);

    return jsonResponse({ success: true, projects_synced: synced, projects_already_synced: skipped });
  } catch (error) {
    console.error("sync-gifting-expense-to-rmpl failed:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
