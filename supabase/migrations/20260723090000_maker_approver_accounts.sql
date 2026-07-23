-- ============================================================
-- Maker / Approver / Accounts role model
-- ============================================================
-- Replaces the old "manager = has direct reports" implicit approval
-- model with an explicit assignment: every maker has exactly one
-- approver (approver_id), independent of the reports_to org chart
-- (which stays for display purposes only, e.g. org-chart UI).
--
-- org_memberships.role gains two new values: 'approver', 'accounts'.
-- 'admin' remains a superuser role (unchanged capabilities).
-- 'employee' is kept as the underlying value for "maker" (display
-- label only change, no data migration needed).

alter table public.profiles
  add column if not exists approver_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_profiles_approver_id on public.profiles(approver_id);

-- ── Approvers can see the profiles of the makers assigned to them ──
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
      and viewer.role = any (array['admin', 'manager'])
      and viewer.is_active = true
      and target.is_active = true
  )
  or reports_to = auth.uid()
  or approver_id = auth.uid()
);

-- ── Org admins can edit any member's profile in their org (was missing
--    entirely before this migration — Users.tsx's edit flow relied on
--    a policy that didn't exist for updating anyone but yourself) ──
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1
    from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
      and viewer.role = 'admin'
      and viewer.is_active = true
      and target.is_active = true
  )
) with check (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1
    from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
      and viewer.role = 'admin'
      and viewer.is_active = true
      and target.is_active = true
  )
);

-- ── Claims routing: approver_id replaces reports_to for who sees /
--    approves a maker's claims ──
drop policy if exists "claims_select" on public.travel_expense_claims;
create policy "claims_select" on public.travel_expense_claims for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (
    org_id is not null and exists (
      select 1 from public.org_memberships
      where org_memberships.user_id = auth.uid()
        and org_memberships.org_id = travel_expense_claims.org_id
        and org_memberships.role = 'admin'
        and org_memberships.is_active = true
    )
  )
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id
      and p.approver_id = auth.uid()
  )
);

drop policy if exists "claims_update" on public.travel_expense_claims;
create policy "claims_update" on public.travel_expense_claims for update using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (
    org_id is not null and exists (
      select 1 from public.org_memberships
      where org_memberships.user_id = auth.uid()
        and org_memberships.org_id = travel_expense_claims.org_id
        and org_memberships.role = any (array['admin', 'manager', 'accounts'])
        and org_memberships.is_active = true
    )
  )
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id
      and p.approver_id = auth.uid()
  )
);

-- ── Accounts (not just admin) can now manage the advances ledger ──
create or replace function public.can_manage_advances(_user_id uuid, _org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.is_platform_admin(_user_id)
      or exists (
        select 1 from public.org_memberships
        where user_id = _user_id and org_id = _org_id
          and role in ('admin', 'accounts') and is_active = true
      );
$$;

-- ── Whether a user holds approval authority in an org (role gate,
--    not "is this specific maker's approver" — that's approver_id) ──
create or replace function public.is_approver_role(_user_id uuid, _org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.is_platform_admin(_user_id)
      or exists (
        select 1 from public.org_memberships
        where user_id = _user_id and org_id = _org_id
          and role in ('admin', 'approver', 'manager') and is_active = true
      );
$$;

grant execute on function public.is_approver_role(uuid, uuid) to authenticated;
