import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

// Keeps the Redefine org's membership in step with RMPL, RMPL being the
// fleet's identity source (see reference_fleet_sso.md). RMPL's own onboarding
// has no hook into this app, so instead of waiting on that we poll RMPL's
// employee roster on a schedule (Cloudflare Worker cron, ~15 min) and create
// whatever's missing here. Additive only: never deactivates or edits anyone
// who is already synced, and never touches RMPL itself.
//
// Runs as a service-to-service call from that Worker, not a signed-in user,
// so it checks a shared secret instead of a Supabase JWT (same shape as any
// other verify_jwt=false function in this project).

const REDEFINE_ORG_ID = "c5f6b811-b6a9-4165-8125-3d4dc6b5bf9a";
const RMPL_EMAIL_DOMAINS = ["redefine.in", "redefinemarcom.in", "asrmedia.in"];

interface RmplProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  reports_to: string | null;
}

interface ExpenseProfile {
  id: string;
  email: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("RMPL_EMPLOYEE_SYNC_SECRET");
  const providedSecret = req.headers.get("x-sync-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const rmplUrl = Deno.env.get("RMPL_URL");
    const rmplKey = Deno.env.get("RMPL_SERVICE_ROLE_KEY");
    if (!rmplUrl || !rmplKey) {
      return jsonResponse({ error: "RMPL connection is not configured" }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // RMPL is the source of truth for who's an active employee — pull its
    // roster fresh every run rather than trusting a point-in-time snapshot.
    const domainFilter = RMPL_EMAIL_DOMAINS.map((d) => `email.ilike.*@${d}`).join(",");
    const rmplParams = new URLSearchParams({
      select: "id,email,full_name,phone,reports_to",
      is_active: "eq.true",
      or: `(${domainFilter})`,
      order: "email.asc",
      limit: "1000",
    });
    const rmplRes = await fetch(`${rmplUrl}/rest/v1/profiles?${rmplParams.toString()}`, {
      headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
    });
    if (!rmplRes.ok) {
      console.error("RMPL fetch failed:", rmplRes.status, await rmplRes.text());
      return jsonResponse({ error: "Could not reach RMPL" }, 502);
    }
    const rmplEmployees = (await rmplRes.json()) as RmplProfile[];
    const rmplById = new Map(rmplEmployees.map((r) => [r.id, r]));

    // Anyone who appears as someone else's manager gets the approver role
    // here, so a newly-hired team lead immediately sees the Approvals UI.
    const managerRmplIds = new Set(
      rmplEmployees.map((r) => r.reports_to).filter((id): id is string => !!id),
    );

    // Match by email against whatever already exists in this app, so a
    // person who already has an Expense login (e.g. from the earlier manual
    // provisioning round) is reused rather than duplicated. Emails aren't
    // consistently cased between the two apps (RMPL has e.g.
    // "Aakash.kumar@..."), so match on the same domain set instead of an
    // exact-cased `.in()` list, which would silently miss anyone whose
    // stored casing differs.
    const domainOr = RMPL_EMAIL_DOMAINS.map((d) => `email.ilike.%@${d}`).join(",");
    const { data: existingProfiles, error: existingErr } = await admin
      .from("profiles")
      .select("id, email")
      .or(domainOr);
    if (existingErr) throw existingErr;
    const expenseIdByEmail = new Map(
      ((existingProfiles ?? []) as ExpenseProfile[]).map((p) => [p.email.toLowerCase(), p.id]),
    );

    const { data: existingMemberships, error: memErr } = await admin
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", REDEFINE_ORG_ID)
      .eq("is_active", true);
    if (memErr) throw memErr;
    const membershipUserIds = new Set((existingMemberships ?? []).map((m) => m.user_id as string));

    const missing = rmplEmployees.filter((r) => {
      const expenseId = expenseIdByEmail.get(r.email.toLowerCase());
      return !expenseId || !membershipUserIds.has(expenseId);
    });

    if (missing.length === 0) {
      return jsonResponse({ success: true, checked: rmplEmployees.length, created: [], skipped: rmplEmployees.length });
    }

    // Phase 1: make sure every missing employee has an auth user + profile,
    // so phase 2 can resolve manager chains even between two people who are
    // both new this run.
    const created: string[] = [];
    const errors: { email: string; error: string }[] = [];

    for (const emp of missing) {
      const email = emp.email.toLowerCase();
      if (expenseIdByEmail.has(email)) continue; // profile exists, only membership is missing

      const { data: userData, error: createErr } = await admin.auth.admin.createUser({
        email: emp.email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { full_name: emp.full_name ?? "" },
      });
      let authUserId = userData?.user?.id;
      if (createErr || !authUserId) {
        // An auth user can already exist without a matching profiles row
        // (e.g. a prior run's profile upsert failed after createUser
        // succeeded), which would otherwise get stuck retrying forever.
        // Recover it by email instead of erroring out.
        if (createErr?.message?.toLowerCase().includes("already been registered")) {
          const lookup = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = lookup.data?.users?.find((u) => u.email?.toLowerCase() === email);
          authUserId = found?.id;
        }
        if (!authUserId) {
          errors.push({ email: emp.email, error: createErr?.message ?? "createUser failed" });
          continue;
        }
      }

      const { error: profileErr } = await admin
        .from("profiles")
        .upsert(
          { id: authUserId, email: emp.email, full_name: emp.full_name ?? "", phone: emp.phone ?? null, is_active: true },
          { onConflict: "id" },
        );
      if (profileErr) {
        errors.push({ email: emp.email, error: profileErr.message });
        // Only roll back the auth user if we just created it — never delete
        // one we recovered by lookup, that account predates this run.
        if (!createErr) await admin.auth.admin.deleteUser(authUserId);
        continue;
      }

      expenseIdByEmail.set(email, authUserId);
    }

    // Phase 2: wire reports_to/approver_id + org membership now that every
    // missing employee (and their manager, new or pre-existing) has an id.
    for (const emp of missing) {
      const email = emp.email.toLowerCase();
      const userId = expenseIdByEmail.get(email);
      if (!userId) continue; // creation failed above, already recorded in errors

      const manager = emp.reports_to ? rmplById.get(emp.reports_to) : null;
      const managerExpenseId = manager ? expenseIdByEmail.get(manager.email.toLowerCase()) ?? null : null;

      const { error: updateErr } = await admin
        .from("profiles")
        .update({
          reports_to: managerExpenseId,
          approver_id: managerExpenseId,
          active_org_id: REDEFINE_ORG_ID,
          must_change_password: true,
        })
        .eq("id", userId);
      if (updateErr) {
        errors.push({ email: emp.email, error: updateErr.message });
        continue;
      }

      const roles = managerRmplIds.has(emp.id) ? ["employee", "approver"] : ["employee"];
      const { error: membershipErr } = await admin
        .from("org_memberships")
        .upsert(
          { org_id: REDEFINE_ORG_ID, user_id: userId, role: roles[roles.length - 1], roles, is_active: true },
          { onConflict: "org_id,user_id" },
        );
      if (membershipErr) {
        errors.push({ email: emp.email, error: membershipErr.message });
        continue;
      }

      created.push(emp.email);
    }

    return jsonResponse({
      success: errors.length === 0,
      checked: rmplEmployees.length,
      created,
      skipped: rmplEmployees.length - missing.length,
      errors,
    });
  } catch (error) {
    console.error("sync-rmpl-employees failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});
