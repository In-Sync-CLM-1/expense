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
}

interface RmplProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

// Reads RMPL's own project list (a separate Supabase project) filtered
// to projects currently in execution, so an approver can tag an advance
// request to the right client project, or a Project Expense claim can be
// filed against it. RMPL owns this data — Expense only ever reads it.
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

    const params = new URLSearchParams({
      select: "id,project_name,project_number,project_owner",
      status: "eq.execution",
      order: "project_name.asc",
      limit: "200",
    });

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
