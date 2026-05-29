-- ============================================================
-- Multi-Tenant Migration — Organizations, Memberships, RLS
-- ============================================================

-- 1. ── Organizations ─────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  logo_url    text,
  industry    text,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- 2. ── Org Memberships (user ↔ org with expense role) ────────
create table if not exists public.org_memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'employee'
             check (role in ('admin', 'manager', 'employee')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_org_memberships_user_id on public.org_memberships(user_id);
create index if not exists idx_org_memberships_org_id  on public.org_memberships(org_id);

-- 3. ── Add org_id to expense tables ──────────────────────────
alter table public.travel_expense_claims
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
create index if not exists idx_claims_org_id on public.travel_expense_claims(org_id);

alter table public.teams
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

alter table public.team_members
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- 4. ── Expand user_roles to allow platform_admin ─────────────
-- Column may be an enum (app_role) or text+check depending on environment.
-- Add to enum if it exists; otherwise recreate the check constraint.
do $$ begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    alter type app_role add value if not exists 'platform_admin';
  else
    alter table public.user_roles drop constraint if exists user_roles_role_check;
    alter table public.user_roles add constraint user_roles_role_check
      check (role in ('admin', 'manager', 'employee', 'platform_admin'));
  end if;
end $$;

-- 5. ── Helper: is_platform_admin (security definer = bypasses RLS) ──
-- Cast role::text to avoid "unsafe use of new enum value in same transaction"
create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text = 'platform_admin'
  );
$$;

-- 6. ── RPC: has_role (used by AuthContext to detect platform_admin) ──
create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text = _role
  );
$$;

-- 7. ── Enable RLS on new tables ──────────────────────────────
alter table public.organizations   enable row level security;
alter table public.org_memberships enable row level security;

-- 8. ── Organizations RLS ─────────────────────────────────────
drop policy if exists "orgs_select" on public.organizations;
create policy "orgs_select" on public.organizations for select using (
  is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = organizations.id and is_active = true
  )
);

drop policy if exists "orgs_insert" on public.organizations;
create policy "orgs_insert" on public.organizations for insert with check (
  is_platform_admin(auth.uid()) or auth.uid() = created_by
);

drop policy if exists "orgs_update" on public.organizations;
create policy "orgs_update" on public.organizations for update using (
  is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = organizations.id
      and role = 'admin' and is_active = true
  )
);

drop policy if exists "orgs_delete" on public.organizations;
create policy "orgs_delete" on public.organizations for delete using (
  is_platform_admin(auth.uid())
);

-- 9. ── Org Memberships RLS ───────────────────────────────────
drop policy if exists "memberships_select" on public.org_memberships;
create policy "memberships_select" on public.org_memberships for select using (
  is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1 from public.org_memberships m2
    where m2.user_id = auth.uid() and m2.org_id = org_memberships.org_id
      and m2.role = 'admin' and m2.is_active = true
  )
);

drop policy if exists "memberships_insert" on public.org_memberships;
create policy "memberships_insert" on public.org_memberships for insert with check (
  is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships m2
    where m2.user_id = auth.uid() and m2.org_id = org_memberships.org_id
      and m2.role = 'admin' and m2.is_active = true
  )
);

drop policy if exists "memberships_update" on public.org_memberships;
create policy "memberships_update" on public.org_memberships for update using (
  is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships m2
    where m2.user_id = auth.uid() and m2.org_id = org_memberships.org_id
      and m2.role = 'admin' and m2.is_active = true
  )
);

drop policy if exists "memberships_delete" on public.org_memberships;
create policy "memberships_delete" on public.org_memberships for delete using (
  is_platform_admin(auth.uid())
  or exists (
    select 1 from public.org_memberships m2
    where m2.user_id = auth.uid() and m2.org_id = org_memberships.org_id
      and m2.role = 'admin' and m2.is_active = true
  )
);

-- 10. ── Profiles RLS — org-scoped ────────────────────────────
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  is_platform_admin(auth.uid())
  or auth.uid() = id
  -- org admin / manager sees all members of same org
  or exists (
    select 1 from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
      and viewer.role in ('admin', 'manager')
      and viewer.is_active = true
      and target.is_active = true
  )
  -- manager sees direct reports regardless of membership
  or exists (
    select 1 from public.profiles sub
    where sub.id = profiles.id and sub.reports_to = auth.uid()
  )
);

-- 11. ── user_roles RLS (only platform_admin matters now) ─────
-- is_platform_admin() uses ::text cast internally so this is safe
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles for select using (
  user_id = auth.uid()
  or is_platform_admin(auth.uid())
);

-- 12. ── Claims RLS — org-scoped ──────────────────────────────
drop policy if exists "claims_select" on public.travel_expense_claims;
create policy "claims_select" on public.travel_expense_claims for select using (
  is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = travel_expense_claims.org_id
      and role = 'admin' and is_active = true
  ))
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id and p.reports_to = auth.uid()
  )
);

drop policy if exists "claims_insert" on public.travel_expense_claims;
create policy "claims_insert" on public.travel_expense_claims for insert with check (
  user_id = auth.uid()
);

drop policy if exists "claims_update" on public.travel_expense_claims;
create policy "claims_update" on public.travel_expense_claims for update using (
  is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = travel_expense_claims.org_id
      and role in ('admin', 'manager') and is_active = true
  ))
  or exists (
    select 1 from public.profiles p
    where p.id = travel_expense_claims.user_id and p.reports_to = auth.uid()
  )
);

-- 13. ── Teams + team_members RLS — org-scoped ────────────────
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select using (
  is_platform_admin(auth.uid())
  or org_id is null
  or exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = teams.org_id and is_active = true
  )
);

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select using (
  is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or (org_id is not null and exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and org_id = team_members.org_id
      and role = 'admin' and is_active = true
  ))
);

-- 14. ── Storage: platform admin + org roles read all ─────────
drop policy if exists "receipts_read" on storage.objects;
create policy "receipts_read" on storage.objects for select using (
  bucket_id = 'expense-receipts'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or is_platform_admin(auth.uid())
    or exists (
      select 1 from public.org_memberships
      where user_id = auth.uid() and role in ('admin', 'manager') and is_active = true
    )
  )
);
