-- ============================================================
-- Multiple roles per org membership
-- ============================================================
-- Until now org_memberships.role was a single value, so a person could
-- be *either* an approver *or* accounts, never both (admin was the only
-- way to get several capabilities, and it grants far more than intended).
-- This adds a roles[] array so a member can hold any combination of
-- maker(employee)/approver/accounts/admin. The scalar `role` column is
-- kept as a representative (most-privileged) value for display and
-- backward compatibility, auto-maintained by a trigger.
--
-- Idempotent (safe to re-run / pre-applied in prod).

alter table public.org_memberships
  add column if not exists roles text[] not null default '{}'::text[];

update public.org_memberships set roles = array[role]
  where roles = '{}'::text[] or roles is null;

alter table public.org_memberships drop constraint if exists org_memberships_roles_valid;
alter table public.org_memberships add constraint org_memberships_roles_valid
  check (roles <@ array['admin','manager','approver','accounts','employee']::text[]);

-- Keep roles[] populated when a caller only sets the scalar role, and keep
-- the scalar role as the most-privileged element for legacy readers/display.
create or replace function public.sync_member_roles()
returns trigger language plpgsql as $$
begin
  if new.roles is null or array_length(new.roles, 1) is null then
    new.roles := array[new.role];
  end if;
  new.role := coalesce(
    (select r from unnest(array['admin','accounts','approver','manager','employee']) as r
      where r = any(new.roles) limit 1),
    new.role
  );
  return new;
end $$;

drop trigger if exists trg_sync_member_roles on public.org_memberships;
create trigger trg_sync_member_roles
  before insert or update on public.org_memberships
  for each row execute function public.sync_member_roles();

-- ── Role-check helpers now read the array ──
create or replace function public.is_org_admin(_user_id uuid, _org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = _user_id and org_id = _org_id and is_active = true
      and 'admin' = any(roles)
  );
$$;

create or replace function public.can_manage_advances(_user_id uuid, _org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin(_user_id)
      or exists (
        select 1 from public.org_memberships
        where user_id = _user_id and org_id = _org_id and is_active = true
          and roles && array['admin','accounts']::text[]
      );
$$;

create or replace function public.is_approver_role(_user_id uuid, _org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin(_user_id)
      or exists (
        select 1 from public.org_memberships
        where user_id = _user_id and org_id = _org_id and is_active = true
          and roles && array['admin','approver','manager']::text[]
      );
$$;

-- ── Policies: scalar role checks -> array overlap (&&) / any() ──
drop policy if exists "orgs_update" on public.organizations;
create policy "orgs_update" on public.organizations for update using (
  public.is_platform_admin(auth.uid()) or public.is_org_admin(auth.uid(), organizations.id)
);

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and public.is_org_admin(auth.uid(), team_members.org_id))
);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid() and target.user_id = profiles.id
      and 'admin' = any(viewer.roles) and viewer.is_active and target.is_active
  )
) with check (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid() and target.user_id = profiles.id
      and 'admin' = any(viewer.roles) and viewer.is_active and target.is_active
  )
);

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  public.is_platform_admin(auth.uid())
  or auth.uid() = id
  or exists (
    select 1 from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid() and target.user_id = profiles.id
      and viewer.roles && array['admin','manager','accounts']::text[]
      and viewer.is_active and target.is_active
  )
  or reports_to = auth.uid()
  or approver_id = auth.uid()
);

drop policy if exists "claims_select" on public.travel_expense_claims;
create policy "claims_select" on public.travel_expense_claims for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = travel_expense_claims.org_id
      and org_memberships.roles && array['admin','accounts']::text[]
      and org_memberships.is_active
  ))
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id and p.approver_id = auth.uid()
  )
);

drop policy if exists "claims_update" on public.travel_expense_claims;
create policy "claims_update" on public.travel_expense_claims for update using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = travel_expense_claims.org_id
      and org_memberships.roles && array['admin','manager','accounts']::text[]
      and org_memberships.is_active
  ))
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id and p.approver_id = auth.uid()
  )
);
