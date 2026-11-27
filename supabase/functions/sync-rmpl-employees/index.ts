import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

// Keeps the Redefine org in step with RMPL, the fleet's identity source.
// RMPL calls this the moment a person is added, edited or exited (database
// trigger on RMPL profiles), and a Cloudflare Worker cron also runs it every
// 15 min as a safety net. Each run is a full reconcile:
//   1. Active RMPL employees missing here get an account + membership.
//   2. Everyone's manager follows RMPL: reports_to and approver_id are set
//      to their RMPL manager, so claims (including ones still waiting for
//      approval) go to that manager. Managers get the approver role.
//   3. People RMPL marks as exited (inactive or with an exit date) lose
//      access: profile and membership go inactive and the login is blocked.
//      If RMPL makes them active again, the block this sync put on is lifted.
// Never touches RMPL itself.
//
// Service-to-service call, so it checks a shared secret instead of a JWT.

const REDEFINE_ORG_ID = "c5f6b811-b6a9-4165-8125-3d4dc6b5bf9a";
const RMPL_EMAIL_DOMAINS = ["redefine.in", "redefinemarcom.in", "asrmedia.in"];
const EXIT_BAN = "876000h"; // ~100 years

interface RmplProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  reports_to: string | null;
  is_active: boolean | null;
  exit_date: string | null;
}

interface ExpenseProfile {
  id: string;
  email: string;
  reports_to: string | null;
  approver_id: string | null;
  is_active: boolean | null;
}

interface Membership {
  user_id: string;
  role: string;
  roles: string[] | null;
  is_active: boolean;
}

const ROLE_PRECEDENCE = ["admin", "accounts", "approver", "manager", "employee"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

function hasExited(p: RmplProfile): boolean {
  return p.is_active === false || !!p.exit_date;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const providedSecret = req.headers.get("x-sync-secret");
  const accepted = [Deno.env.get("RMPL_EMPLOYEE_SYNC_SECRET"), Deno.env.get("RMPL_PUSH_SECRET")]
    .filter((s): s is string => !!s);
  if (!providedSecret || !accepted.includes(providedSecret)) {
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

    // Whole RMPL roster on our domains, active and exited, fresh every run.
    const domainFilter = RMPL_EMAIL_DOMAINS.map((d) => `email.ilike.*@${d}`).join(",");
    const rmplParams = new URLSearchParams({
      select: "id,email,full_name,phone,reports_to,is_active,exit_date",
      or: `(${domainFilter})`,
      order: "email.asc",
      limit: "5000",
    });
    const rmplRes = await fetch(`${rmplUrl}/rest/v1/profiles?${rmplParams.toString()}`, {
      headers: { apikey: rmplKey, Authorization: `Bearer ${rmplKey}` },
    });
    if (!rmplRes.ok) {
      console.error("RMPL fetch failed:", rmplRes.status, await rmplRes.text());
      return jsonResponse({ error: "Could not reach RMPL" }, 502);
    }
    const rmplAll = ((await rmplRes.json()) as RmplProfile[]).filter((r) => !!r.email);
    const rmplById = new Map(rmplAll.map((r) => [r.id, r]));
    const rmplEmployees = rmplAll.filter((r) => !hasExited(r));
    // An email can appear twice in RMPL (an old exited profile and a new
    // active one); the active one wins, so only treat an email as exited
    // when no active profile carries it.
    const activeEmails = new Set(rmplEmployees.map((r) => r.email.toLowerCase()));
    const exitedEmails = new Set(
      rmplAll.filter(hasExited).map((r) => r.email.toLowerCase()).filter((e) => !activeEmails.has(e)),
    );

    // Anyone who is an active employee's manager needs the approver role.
    const managerRmplIds = new Set(
      rmplEmployees.map((r) => r.reports_to).filter((id): id is string => !!id),
    );

    const domainOr = RMPL_EMAIL_DOMAINS.map((d) => `email.ilike.%@${d}`).join(",");
    const { data: existingProfiles, error: existingErr } = await admin
      .from("profiles")
      .select("id, email, reports_to, approver_id, is_active")
      .or(domainOr);
    if (existingErr) throw existingErr;
    const profileByEmail = new Map(
      ((existingProfiles ?? []) as ExpenseProfile[]).map((p) => [p.email.toLowerCase(), p]),
    );
    const expenseIdByEmail = new Map(
      [...profileByEmail.entries()].map(([e, p]) => [e, p.id]),
    );

    const { data: membershipRows, error: memErr } = await admin
      .from("org_memberships")
      .select("user_id, role, roles, is_active")
      .eq("org_id", REDEFINE_ORG_ID);
    if (memErr) throw memErr;
    const membershipByUser = new Map(
      ((membershipRows ?? []) as Membership[]).map((m) => [m.user_id, m]),
    );

    const created: string[] = [];
    const managersUpdated: string[] = [];
    const approverRoleAdded: string[] = [];
    const deactivated: string[] = [];
    const reactivated: string[] = [];
    const errors: { email: string; error: string }[] = [];

    // ── 1. Create missing active employees ─────────────────────────────
    const missing = rmplEmployees.filter((r) => {
      const expenseId = expenseIdByEmail.get(r.email.toLowerCase());
      return !expenseId || !membershipByUser.get(expenseId)?.is_active;
    });

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
        // An auth user can exist without a profiles row (an earlier run's
        // profile upsert failed after createUser); recover it by email.
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
        if (!createErr) await admin.auth.admin.deleteUser(authUserId);
        continue;
      }

      await admin.from("profiles").update({ active_org_id: REDEFINE_ORG_ID, must_change_password: true }).eq("id", authUserId);
      expenseIdByEmail.set(email, authUserId);
      profileByEmail.set(email, { id: authUserId, email: emp.email, reports_to: null, approver_id: null, is_active: true });
      created.push(emp.email);
    }

    // ── 2. Every active employee: membership, manager, approver role ───
    for (const emp of rmplEmployees) {
      const email = emp.email.toLowerCase();
      const profile = profileByEmail.get(email);
      if (!profile) continue; // creation failed above

      // Back from an exit (or never had a membership): reopen access.
      const membership = membershipByUser.get(profile.id);
      if (!membership?.is_active || profile.is_active === false) {
        const roles = membership?.roles?.length ? membership.roles : ["employee"];
        const role = ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? "employee";
        const { error: upErr } = await admin
          .from("org_memberships")
          .upsert(
            { org_id: REDEFINE_ORG_ID, user_id: profile.id, role, roles, is_active: true },
            { onConflict: "org_id,user_id" },
          );
        if (upErr) {
          errors.push({ email: emp.email, error: upErr.message });
          continue;
        }
        membershipByUser.set(profile.id, { user_id: profile.id, role, roles, is_active: true });
        if (profile.is_active === false) {
          await admin.from("profiles").update({ is_active: true }).eq("id", profile.id);
          reactivated.push(emp.email);
        }
      }

      // Lift a login block that this sync put on at exit.
      if (membership && !membership.is_active || profile.is_active === false) {
        const { data: au } = await admin.auth.admin.getUserById(profile.id);
        if (au?.user?.app_metadata?.rmpl_exit_block) {
          await admin.auth.admin.updateUserById(profile.id, {
            ban_duration: "none",
            app_metadata: { ...au.user.app_metadata, rmpl_exit_block: false },
          });
        }
      }

      // Manager follows RMPL. No manager in RMPL → leave the current one,
      // so nobody's claims are left with no approver.
      const manager = emp.reports_to ? rmplById.get(emp.reports_to) : null;
      const managerExpenseId = manager && !hasExited(manager)
        ? expenseIdByEmail.get(manager.email.toLowerCase()) ?? null
        : null;
      if (managerExpenseId && managerExpenseId !== profile.id &&
          (profile.reports_to !== managerExpenseId || profile.approver_id !== managerExpenseId)) {
        const { error: mErr } = await admin
          .from("profiles")
          .update({ reports_to: managerExpenseId, approver_id: managerExpenseId })
          .eq("id", profile.id);
        if (mErr) errors.push({ email: emp.email, error: mErr.message });
        else managersUpdated.push(emp.email);
      }

      // Managers can open Approvals.
      if (managerRmplIds.has(emp.id)) {
        const m = membershipByUser.get(profile.id);
        const roles = m?.roles?.length ? m.roles : [m?.role ?? "employee"];
        if (m && !roles.includes("approver") && !roles.includes("admin") && !roles.includes("manager")) {
          const next = [...roles.filter((r) => r !== "employee"), "approver"];
          const role = ROLE_PRECEDENCE.find((r) => next.includes(r)) ?? "approver";
          const { error: rErr } = await admin
            .from("org_memberships")
            .update({ roles: next, role })
            .eq("org_id", REDEFINE_ORG_ID)
            .eq("user_id", profile.id);
          if (rErr) errors.push({ email: emp.email, error: rErr.message });
          else approverRoleAdded.push(emp.email);
        }
      }
    }

    // ── 3. Exited in RMPL → no access here ─────────────────────────────
    for (const email of exitedEmails) {
      const profile = profileByEmail.get(email);
      if (!profile) continue;
      const membership = membershipByUser.get(profile.id);
      const needs = profile.is_active !== false || membership?.is_active;
      if (!needs) continue;

      if (membership?.is_active) {
        const { error: e1 } = await admin
          .from("org_memberships")
          .update({ is_active: false })
          .eq("org_id", REDEFINE_ORG_ID)
          .eq("user_id", profile.id);
        if (e1) { errors.push({ email, error: e1.message }); continue; }
      }
      const { error: e2 } = await admin.from("profiles").update({ is_active: false }).eq("id", profile.id);
      if (e2) { errors.push({ email, error: e2.message }); continue; }

      const { data: au } = await admin.auth.admin.getUserById(profile.id);
      if (au?.user) {
        const { error: e3 } = await admin.auth.admin.updateUserById(profile.id, {
          ban_duration: EXIT_BAN,
          app_metadata: { ...au.user.app_metadata, rmpl_exit_block: true },
        });
        if (e3) { errors.push({ email, error: e3.message }); continue; }
      }
      deactivated.push(email);
    }

    return jsonResponse({
      success: errors.length === 0,
      checked: rmplAll.length,
      created,
      managersUpdated,
      approverRoleAdded,
      deactivated,
      reactivated,
      errors,
    });
  } catch (error) {
    console.error("sync-rmpl-employees failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});
