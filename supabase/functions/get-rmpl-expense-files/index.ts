import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RmplSubmission {
  id: string;
  created_at: string;
  expense_category: string[] | null;
  total_amount: number | null;
  excel_url: string | null;
  excel_filename: string | null;
  invoice_urls: { name: string; url: string }[] | null;
}

const RMPL_APP = "https://rmpl.in-sync.co.in";

// Returns the break-up cost sheet and supporting invoices the RMPL team
// submitted in OPM for the project a Project Expense claim is filed against,
// as short-lived links, so the approver can see them next to the claim.
// The caller must be able to see the claim (checked with their own session).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rmplUrl = Deno.env.get("RMPL_URL");
    const rmplKey = Deno.env.get("RMPL_SERVICE_ROLE_KEY");
    if (!rmplUrl || !rmplKey) return jsonResponse({ error: "RMPL connection is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Not signed in" }, 401);

    const { claim_id } = await req.json().catch(() => ({})) as { claim_id?: string };
    if (!claim_id) return jsonResponse({ error: "claim_id is required" }, 400);

    // RLS decides whether this person may see the claim.
    const { data: claim } = await userClient
      .from("project_expense_claims")
      .select("rmpl_project_id")
      .eq("id", claim_id)
      .maybeSingle();
    if (!claim?.rmpl_project_id) return jsonResponse({ error: "Claim not found" }, 404);

    const params = new URLSearchParams({
      select: "id,created_at,expense_category,total_amount,excel_url,excel_filename,invoice_urls",
      project_id: `eq.${claim.rmpl_project_id}`,
      order: "created_at.desc",
    });
    const res = await fetch(`${rmplUrl}/rest/v1/project_expense_submissions?${params}`, {
      headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
    });
    if (!res.ok) {
      console.error("RMPL fetch failed:", res.status, await res.text());
      return jsonResponse({ error: "Could not reach RMPL" }, 502);
    }
    const rows = (await res.json()) as RmplSubmission[];

    const link = async (fileUrl: string): Promise<string | null> => {
      const marker = "/api/storage/o/";
      const idx = fileUrl.indexOf(marker);
      if (idx < 0) return null;
      let key = fileUrl.slice(idx + marker.length);
      try { key = decodeURIComponent(key); } catch { /* keep raw */ }
      const r = await fetch(`${RMPL_APP}/api/storage/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rmplKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key, expiresIn: 900 }),
      });
      if (!r.ok) return null;
      return (await r.json()).signedUrl ?? null;
    };

    const submissions = await Promise.all(
      rows
        .filter((s) => s.excel_url || (s.invoice_urls || []).length > 0)
        .map(async (s) => ({
          id: s.id,
          created_at: s.created_at,
          expense_category: s.expense_category ?? [],
          total_amount: s.total_amount,
          excel: s.excel_url && s.excel_filename
            ? { name: s.excel_filename, url: await link(s.excel_url) }
            : null,
          invoices: await Promise.all(
            (s.invoice_urls || []).map(async (f) => ({ name: f.name, url: await link(f.url) })),
          ),
        })),
    );

    return jsonResponse({ submissions });
  } catch (e) {
    console.error("get-rmpl-expense-files error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
