-- Fix: infinite recursion (42P17) in org_memberships RLS policies.
-- memberships_select/insert/update/delete each did
--   `exists (select 1 from org_memberships m2 where ... role='admin' ...)`
-- which re-triggers memberships_select on the inner query -> recursion.
-- Replace the inner self-references with SECURITY DEFINER helpers that
-- bypass RLS, mirroring the existing is_platform_admin pattern.

create or replace function public.is_org_admin(_user_id uuid, _org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = _user_id
      and org_id = _org_id
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = _user_id
      and org_id = _org_id
      and is_active = true
  );
$$;

drop policy if exists "memberships_select" on public.org_memberships;
create policy "memberships_select" on public.org_memberships for select using (
  is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or is_org_admin(auth.uid(), org_id)
);

drop policy if exists "memberships_insert" on public.org_memberships;
create policy "memberships_insert" on public.org_memberships for insert with check (
  is_platform_admin(auth.uid())
  or is_org_admin(auth.uid(), org_id)
);

drop policy if exists "memberships_update" on public.org_memberships;
create policy "memberships_update" on public.org_memberships for update using (
  is_platform_admin(auth.uid())
  or is_org_admin(auth.uid(), org_id)
);

drop policy if exists "memberships_delete" on public.org_memberships;
create policy "memberships_delete" on public.org_memberships for delete using (
  is_platform_admin(auth.uid())
  or is_org_admin(auth.uid(), org_id)
);
