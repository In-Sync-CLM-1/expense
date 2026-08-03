-- Fix: Reports-page CSV export shows blank Employee/Email for every row.
--
-- profiles_select grants admin/manager/accounts viewers org-wide profile
-- read via an inline
--   exists (select 1 from org_memberships viewer join org_memberships target ...)
-- but org_memberships itself is RLS-protected by memberships_select, which
-- only allows a non-admin viewer to see their OWN row (or an org-admin to see
-- everyone's, via the is_org_admin() bypass). Because "target" here is some
-- OTHER user's org_memberships row, memberships_select hides it from any
-- viewer whose role is 'accounts', 'manager' or 'approver' (not 'admin'),
-- so the join always finds zero rows and profiles_select silently denies —
-- exactly the case for the Reports page, whose primary non-admin audience
-- is the 'accounts' role.
--
-- Fix: move the cross-user check into a SECURITY DEFINER function (same
-- pattern already used by is_org_admin/is_approver_role/can_manage_advances),
-- which runs as the migration-owning role and bypasses org_memberships RLS
-- entirely, avoiding the recursion.
--
-- Idempotent (safe to re-run / pre-applied in prod).

create or replace function public.can_view_org_member_profile(_viewer_id uuid, _target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_memberships viewer
    join public.org_memberships target on target.org_id = viewer.org_id
    where viewer.user_id = _viewer_id
      and target.user_id = _target_id
      and viewer.roles && array['admin','manager','accounts']::text[]
      and viewer.is_active
      and target.is_active
  );
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  is_platform_admin(auth.uid())
  or auth.uid() = id
  or public.can_view_org_member_profile(auth.uid(), profiles.id)
  or reports_to = auth.uid()
  or approver_id = auth.uid()
);
