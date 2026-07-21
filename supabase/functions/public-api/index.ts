import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public API for client apps (e.g. RMPL) — auth via API key (Bearer isk_live_...).
// Read-only reporting only: the actual filing/approval workflow lives in this
// app, never in the calling client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function jsonOk(data: object, requestId: string) {
  return new Response(JSON.stringify({ success: true, ...data, request_id: requestId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(code: string, message: string, status = 400, requestId?: string) {
  return new Response(
    JSON.stringify({ success: false, error: code, message, request_id: requestId ?? crypto.randomUUID() }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer isk_live_")) {
      return jsonErr("unauthorized", "Valid API key required (Bearer isk_live_...)", 401, requestId);
    }
    const apiKey = authHeader.replace("Bearer ", "").trim();
    const keyHash = await sha256Hex(apiKey);

    const { data: keyRecord } = await supabase
      .from("api_keys")
      .select("id, org_id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (!keyRecord) {
      return jsonErr("unauthorized", "Invalid or inactive API key", 401, requestId);
    }
    const orgId: string = keyRecord.org_id;

    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id).then(() => {});

    const body = await req.json().catch(() => ({}));
    const action = req.headers.get("X-Action") || body.action;
    if (!action) {
      return jsonErr("missing_action", "action is required (body.action)", 400, requestId);
    }

    // ── list_expense_claims ─────────────────────────────────────────
    if (action === "list_expense_claims") {
      const { data: claims, error } = await supabase
        .from("travel_expense_claims")
        .select(
          "id, trip_title, trip_start_date, trip_end_date, destination, purpose, total_amount, approved_amount, currency, status, submitted_at, approved_at, rejection_reason, reimbursed_at, created_at, profiles:user_id(full_name, email), approver:approved_by(full_name), travel_expense_items(expense_type, description, amount, expense_date)"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) return jsonErr("query_failed", error.message, 500, requestId);

      const data = (claims || []).map((c: any) => ({
        id: c.id,
        trip_title: c.trip_title,
        trip_start_date: c.trip_start_date,
        trip_end_date: c.trip_end_date,
        destination: c.destination,
        purpose: c.purpose,
        total_amount: c.total_amount,
        approved_amount: c.approved_amount,
        currency: c.currency,
        status: c.status,
        submitted_at: c.submitted_at,
        approved_at: c.approved_at,
        rejection_reason: c.rejection_reason,
        reimbursed_at: c.reimbursed_at,
        created_at: c.created_at,
        employee_name: c.profiles?.full_name ?? null,
        employee_email: c.profiles?.email ?? null,
        approver_name: c.approver?.full_name ?? null,
        items: (c.travel_expense_items || []).map((i: any) => ({
          expense_type: i.expense_type,
          description: i.description,
          amount: i.amount,
          expense_date: i.expense_date,
        })),
      }));

      return jsonOk({ data }, requestId);
    }

    // ── list_advances ───────────────────────────────────────────────
    if (action === "list_advances") {
      const { data: advances, error } = await supabase
        .from("expense_advances")
        .select(
          "id, amount, advance_date, note, created_at, profiles:user_id(full_name, email), giver:given_by(full_name), claim:claim_id(trip_title)"
        )
        .eq("org_id", orgId)
        .order("advance_date", { ascending: false });

      if (error) return jsonErr("query_failed", error.message, 500, requestId);

      const data = (advances || []).map((a: any) => ({
        id: a.id,
        amount: a.amount,
        advance_date: a.advance_date,
        note: a.note,
        created_at: a.created_at,
        employee_name: a.profiles?.full_name ?? null,
        employee_email: a.profiles?.email ?? null,
        given_by_name: a.giver?.full_name ?? null,
        trip_title: a.claim?.trip_title ?? null,
      }));

      return jsonOk({ data }, requestId);
    }

    // ── get_expense_analytics ───────────────────────────────────────
    if (action === "get_expense_analytics") {
      const { data: claimsRaw, error: cErr } = await supabase
        .from("travel_expense_claims")
        .select("id, user_id, total_amount, approved_amount, status, submitted_at, approved_at, created_at, profiles:user_id(full_name)")
        .eq("org_id", orgId);
      if (cErr) return jsonErr("query_failed", cErr.message, 500, requestId);

      const { data: itemsRaw, error: iErr } = await supabase
        .from("travel_expense_items")
        .select("expense_type, amount, claim_id, travel_expense_claims!inner(org_id)")
        .eq("travel_expense_claims.org_id", orgId);
      if (iErr) return jsonErr("query_failed", iErr.message, 500, requestId);

      const { data: advancesRaw, error: aErr } = await supabase
        .from("expense_advances")
        .select("amount, user_id, profiles:user_id(full_name)")
        .eq("org_id", orgId);
      if (aErr) return jsonErr("query_failed", aErr.message, 500, requestId);

      type Claim = { id: string; user_id: string; total_amount: number; approved_amount: number | null;
        status: string; submitted_at: string | null; approved_at: string | null; created_at: string;
        profiles: { full_name: string } | null };
      const claims = (claimsRaw || []) as unknown as Claim[];
      const items = (itemsRaw || []) as unknown as { expense_type: string; amount: number }[];
      const advances = (advancesRaw || []) as unknown as { amount: number; user_id: string; profiles: { full_name: string } | null }[];

      const sanctioned = (c: Claim) => Number(c.approved_amount ?? c.total_amount ?? 0);

      const byStatus: Record<string, { count: number; amount: number }> = {};
      for (const c of claims) {
        const s = byStatus[c.status] || { count: 0, amount: 0 };
        s.count += 1;
        s.amount += sanctioned(c);
        byStatus[c.status] = s;
      }

      const byCategory: Record<string, { count: number; amount: number }> = {};
      for (const i of items) {
        const s = byCategory[i.expense_type] || { count: 0, amount: 0 };
        s.count += 1;
        s.amount += Number(i.amount);
        byCategory[i.expense_type] = s;
      }

      const ym = (iso: string | null) => (iso || "").slice(0, 7);
      const byMonth: Record<string, number> = {};
      for (const c of claims) {
        if (c.status === "rejected" || c.status === "draft") continue;
        const key = ym(c.submitted_at || c.created_at);
        byMonth[key] = (byMonth[key] || 0) + sanctioned(c);
      }

      const byEmployee = new Map<string, { name: string; count: number; amount: number }>();
      for (const c of claims) {
        if (c.status === "rejected" || c.status === "draft") continue;
        const row = byEmployee.get(c.user_id) || { name: c.profiles?.full_name || "Unknown", count: 0, amount: 0 };
        row.count += 1;
        row.amount += sanctioned(c);
        byEmployee.set(c.user_id, row);
      }
      const topEmployees = Array.from(byEmployee.values()).sort((a, b) => b.amount - a.amount).slice(0, 20);

      const pending = claims.filter((c) => c.status === "submitted");
      const advancesTotal = advances.reduce((s, a) => s + Number(a.amount), 0);
      const approvedTotal = claims
        .filter((c) => ["approved", "partially_approved", "reimbursed"].includes(c.status))
        .reduce((s, c) => s + sanctioned(c), 0);

      const analytics = {
        totalClaims: claims.length,
        byStatus,
        byCategory,
        byMonth: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })),
        topEmployees,
        pendingCount: pending.length,
        pendingAmount: pending.reduce((s, c) => s + sanctioned(c), 0),
        advancesTotal,
        advancesCount: advances.length,
        approvedTotal,
        advanceBalance: advancesTotal - approvedTotal,
      };

      return jsonOk({ data: analytics }, requestId);
    }

    return jsonErr("unknown_action", `Unknown action: ${action}`, 400, requestId);
  } catch (err) {
    console.error("Public API error:", err);
    return jsonErr("internal_error", "Request failed", 500, requestId);
  }
});
