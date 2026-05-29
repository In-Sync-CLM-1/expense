-- Atomic org-bootstrap: create org + admin membership in one SECURITY DEFINER
-- call, bypassing the chicken-and-egg between orgs_select and
-- memberships_insert RLS policies (both of which require an existing
-- membership the user can't create client-side).

create or replace function public.create_organization(
  p_name     text,
  p_slug     text,
  p_industry text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'organisation name is required';
  end if;
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'organisation slug is required';
  end if;

  insert into public.organizations (name, slug, industry, created_by)
  values (trim(p_name), trim(p_slug), nullif(trim(p_industry), ''), v_uid)
  returning id into v_id;

  insert into public.org_memberships (org_id, user_id, role, is_active)
  values (v_id, v_uid, 'admin', true);

  return v_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;
