-- ============================================================
-- Link a disbursed advance to a Project Expense claim
-- ============================================================
-- expense_advances can only be inserted/updated by Accounts/Admin
-- (can_manage_advances) — a regular filer only has SELECT on their own
-- rows. But "Advance Received" on a Project Expense claim must be
-- pulled from money actually paid out (an expense_advances row the
-- filer already holds), chosen by the filer themself while drafting
-- their claim. This narrow, security-definer RPC lets a filer link
-- (or re-link, while their claim is still a draft) one of their own
-- unconsumed disbursed advances to their own claim — nothing more.

create or replace function public.link_project_expense_advance(_advance_id uuid, _claim_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_advance record;
  v_claim record;
begin
  select id, user_id, org_id, amount, project_claim_id into v_advance
  from public.expense_advances where id = _advance_id;

  select id, user_id, status into v_claim
  from public.project_expense_claims where id = _claim_id;

  if v_advance.id is null then
    raise exception 'Advance not found';
  end if;
  if v_claim.id is null then
    raise exception 'Claim not found';
  end if;
  if v_advance.user_id <> auth.uid() or v_claim.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_claim.status <> 'draft' then
    raise exception 'Claim is no longer a draft';
  end if;
  if v_advance.project_claim_id is not null and v_advance.project_claim_id <> _claim_id then
    raise exception 'Advance already linked to another claim';
  end if;

  -- Release any advance previously linked to this claim (user changed their pick)
  update public.expense_advances set project_claim_id = null
  where project_claim_id = _claim_id and id <> _advance_id;

  update public.expense_advances set project_claim_id = _claim_id
  where id = _advance_id;

  update public.project_expense_claims set advance_id = _advance_id, advance_amount = v_advance.amount
  where id = _claim_id;

  return v_advance.amount;
end;
$$;

grant execute on function public.link_project_expense_advance(uuid, uuid) to authenticated;
