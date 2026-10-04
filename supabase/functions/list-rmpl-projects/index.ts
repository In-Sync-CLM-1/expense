import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RmplProjectRow {
  id: string;
  project_name: string;
  project_number: string | null;
  project_owner: string | null;
  status: string | null;
}

interface RmplProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

// Reads RMPL's own project list (a separate Supabase project) — every
// status, not just "execution" — so an approver can tag an advance
// request to the right client project, or a Project Expense claim can be
// filed against it. RMPL project status is user-entered and often stale
// (e.g. still "In Discussion" long after the event ran), so it can't be
// trusted to gate which projects are claimable. RMPL owns this data —
// Expense only ever reads it.
// Also resolves each project's owner (RMPL's own profiles.id/full_name/
// email) and, for the RMPL org's Project Expense flow, matches that
// owner's email into THIS app's profiles table so the claim can be
// routed to them for approval without a manual picker.
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
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }

    // RMPL has ~1,000+ projects and PostgREST silently caps any single read
    // at 1,000 rows, so the picker never loads the whole list. It searches
    // instead: `search` (name or project number), `ids` (resolve a saved
    // selection) or `numbers` (exact project numbers / names, for the Excel
    // import). With none of them, the 50 most recently created are returned.
    const body = await req.json().catch(() => ({})) as {
      search?: string;
      ids?: string[];
      numbers?: string[];
    };
    const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
    const params = new URLSearchParams({
      select: "id,project_name,project_number,project_owner,status",
      order: "project_name.asc",
      limit: "50",
    });
    const ids = (body.ids ?? []).filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 200);
    const numbers = (body.numbers ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 500);
    const term = String(body.search ?? "").replace(/[,()"*%\\]/g, " ").trim();
    if (ids.length > 0) {
      params.set("id", `in.(${ids.join(",")})`);
      params.set("limit", "200");
    } else if (numbers.length > 0) {
      const list = numbers.map(quote).join(",");
      params.set("or", `(project_number.in.(${list}),project_name.in.(${list}))`);
      params.set("limit", "1000");
    } else if (term) {
      params.set("or", `(project_name.ilike.*${term}*,project_number.ilike.*${term}*)`);
    } else {
      params.set("order", "created_at.desc");
    }

    const rmplRes = await fetch(`${rmplUrl}/rest/v1/projects?${params.toString()}`, {
      headers: {
        apikey: rmplKey,
        Authorization: `Bearer ${rmplKey}`,
      },
    });
    if (!rmplRes.ok) {
      console.error("RMPL fetch failed:", rmplRes.status, await rmplRes.text());
      return jsonResponse({ error: "Could not reach RMPL" }, 502);
    }

    const projects = await rmplRes.json() as RmplProjectRow[];

    const ownerIds = [...new Set(projects.map((p) => p.project_owner).filter((id): id is string => !!id))];
    let owners: RmplProfileRow[] = [];
    if (ownerIds.length > 0) {
      const ownerParams = new URLSearchParams({
        select: "id,full_name,email",
        id: `in.(${ownerIds.join(",")})`,
      });
      const ownersRes = await fetch(`${rmplUrl}/rest/v1/profiles?${ownerParams.toString()}`, {
        headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
      });
      if (ownersRes.ok) owners = await ownersRes.json();
    }
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    // Match project-owner emails into this app's own profiles so a
    // Project Expense claim can be routed to that person for approval.
    const ownerEmails = [...new Set(owners.map((o) => o.email).filter((e): e is string => !!e))];
    let localMatches: { id: string; email: string }[] = [];
    if (ownerEmails.length > 0) {
      const { data } = await admin
        .from("profiles")
        .select("id, email")
        .in("email", ownerEmails);
      localMatches = (data ?? []) as { id: string; email: string }[];
    }
    const localUserIdByEmail = new Map(
      localMatches.map((m) => [m.email.toLowerCase(), m.id])
    );

    const enriched = projects.map((p) => {
      const owner = p.project_owner ? ownerById.get(p.project_owner) : null;
      const ownerEmail = owner?.email ?? null;
      return {
        id: p.id,
        project_name: p.project_name,
        project_number: p.project_number,
        status: p.status,
        project_owner_external_id: p.project_owner,
        project_owner_name: owner?.full_name ?? null,
        project_owner_email: ownerEmail,
        project_owner_user_id: ownerEmail ? localUserIdByEmail.get(ownerEmail.toLowerCase()) ?? null : null,
      };
    });

    return jsonResponse({ projects: enriched });
  } catch (error) {
    console.error("list-rmpl-projects failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
