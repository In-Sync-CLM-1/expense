-- Owner decision 2026-11-21 (Redefine TASK-2909): project expense claims on
-- RMPL-26-999 ("RMPL Internal for BD - HR professionals") go to the
-- claimant's reporting manager (profiles.approver_id), not to the project's
-- owner. Every other project keeps routing to its Project Owner.
--
-- project_owner_user_id is the single field that decides who sees, approves
-- and is emailed about a project claim (RLS, Approvals page, notification),
-- so the exception rewrites that field on save. A claimant with no approver
-- set keeps the project owner, so a claim is never left without an approver.

create or replace function public.pe_claim_route_to_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mgr record;
begin
  if new.project_number is distinct from 'RMPL-26-999' then
    return new;
  end if;

  select m.id, m.full_name, m.email
    into v_mgr
    from public.profiles p
    join public.profiles m on m.id = p.approver_id
   where p.id = new.user_id;

  if found then
    new.project_owner_user_id     := v_mgr.id;
    new.project_owner_name        := v_mgr.full_name;
    new.project_owner_email       := v_mgr.email;
    new.project_owner_external_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pe_claim_route_to_manager on public.project_expense_claims;
create trigger trg_pe_claim_route_to_manager
  before insert or update of project_number, project_owner_user_id, user_id
  on public.project_expense_claims
  for each row execute function public.pe_claim_route_to_manager();

-- Claims on RMPL-26-999 still waiting for approval move to the manager now.
update public.project_expense_claims
   set project_owner_user_id = project_owner_user_id
 where project_number = 'RMPL-26-999'
   and status in ('draft', 'submitted');
