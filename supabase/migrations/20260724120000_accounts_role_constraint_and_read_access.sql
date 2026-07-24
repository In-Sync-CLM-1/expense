-- ============================================================
-- Fix: make the Accounts (and Approver) role actually usable
-- ============================================================
-- The 20260723090000_maker_approver_accounts migration introduced the
-- 'approver' and 'accounts' role values and wired their *write* paths
-- (claims_update, can_manage_advances), but two things were missed and
-- silently broke the role in production:
--
--   1. org_memberships.role still had a CHECK constraint allowing only
--      ('admin','manager','employee'), so assigning 'accounts'/'approver'
--      failed with a constraint violation — the role could never be given
--      to anyone.
--
--   2. claims_select (and profiles_select) only granted org-wide read to
--      'admin'. A pure 'accounts' user could UPDATE a claim to reimbursed
--      but could not SELECT it, so their processing screen (Reports) was
--      empty. Advances were unaffected (advance policies already use
--      can_manage_advances, which includes accounts).
--
-- This migration is idempotent (safe to re-run / pre-applied in prod).

-- ── 1. Allow the full role vocabulary the app uses ──
alter table public.org_memberships
  drop constraint if exists org_memberships_role_check;
alter table public.org_memberships
  add constraint org_memberships_role_check
  check (role = any (array['admin','manager','approver','accounts','employee']));

-- ── 2a. Accounts can view claims org-wide (to process reimbursements) ──
drop policy if exists "claims_select" on public.travel_expense_claims;
create policy "claims_select" on public.travel_expense_claims for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (
    org_id is not null and exists (
      select 1 from public.org_memberships
      where org_memberships.user_id = auth.uid()
        and org_memberships.org_id = travel_expense_claims.org_id
        and org_memberships.role = any (array['admin','accounts'])
        and org_memberships.is_active = true
    )
  )
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id
      and p.approver_id = auth.uid()
  )
);

-- ── 2b. Accounts can view org members' profiles (claimant names on the
--        processing screen) ──
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  public.is_platform_admin(auth.uid())
  or auth.uid() = id
  or exists (
    select 1
    from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
      and viewer.role = any (array['admin','manager','accounts'])
      and viewer.is_active = true
      and target.is_active = true
  )
  or reports_to = auth.uid()
  or approver_id = auth.uid()
);
