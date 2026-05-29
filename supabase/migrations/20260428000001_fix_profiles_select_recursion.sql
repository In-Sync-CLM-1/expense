-- Fix: infinite recursion (42P17) in profiles_select policy.
-- Original branch did `select 1 from public.profiles sub where sub.id = profiles.id and sub.reports_to = auth.uid()`,
-- which re-evaluates profiles_select on every row -> recursion.
-- Replaced with a direct column reference to reports_to, which is logically equivalent.

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  is_platform_admin(auth.uid())
  or auth.uid() = id
  or exists (
    select 1
    from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = auth.uid()
      and target.user_id = profiles.id
      and viewer.role = any (array['admin','manager'])
      and viewer.is_active = true
      and target.is_active = true
  )
  or reports_to = auth.uid()
);
