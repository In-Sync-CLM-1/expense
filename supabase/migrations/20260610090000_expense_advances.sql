-- ============================================================
-- Advances register
-- ============================================================
-- An advance is money the company gives an employee BEFORE a trip,
-- usually against a specific expense claim (claim_id) but optionally
-- general (claim_id NULL). Settlement is per (employee, trip):
--   balance = advances_given − approved_expenses
--     balance > 0 → employee holds unspent advance (recover it)
--     balance < 0 → expenses exceeded the advance   (company owes them)
--     balance = 0 → settled
-- General advances settle against the employee's approved claims that
-- have NO advance of their own.

create table if not exists public.expense_advances (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  claim_id     uuid references public.travel_expense_claims(id) on delete set null,
  amount       numeric(12,2) not null check (amount >= 0),
  advance_date date not null default current_date,
  note         text,
  given_by     uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_expense_advances_org   on public.expense_advances(org_id);
create index if not exists idx_expense_advances_user  on public.expense_advances(user_id);
create index if not exists idx_expense_advances_claim on public.expense_advances(claim_id);

create or replace trigger expense_advances_updated_at
  before update on public.expense_advances
  for each row execute function public.set_updated_at();

-- Who manages advances: the org's admins (and platform admins).
create or replace function public.can_manage_advances(_user_id uuid, _org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.is_platform_admin(_user_id)
      or exists (
        select 1 from public.org_memberships
        where user_id = _user_id and org_id = _org_id
          and role = 'admin' and is_active = true
      );
$$;

alter table public.expense_advances enable row level security;

-- Employees see their own advances; org admins see all of their org's.
drop policy if exists "advances_select" on public.expense_advances;
create policy "advances_select" on public.expense_advances for select using (
  user_id = auth.uid() or public.can_manage_advances(auth.uid(), org_id)
);

-- Only org admins record, correct, or remove advances.
drop policy if exists "advances_insert" on public.expense_advances;
create policy "advances_insert" on public.expense_advances for insert
  with check (public.can_manage_advances(auth.uid(), org_id));

drop policy if exists "advances_update" on public.expense_advances;
create policy "advances_update" on public.expense_advances for update
  using (public.can_manage_advances(auth.uid(), org_id))
  with check (public.can_manage_advances(auth.uid(), org_id));

drop policy if exists "advances_delete" on public.expense_advances;
create policy "advances_delete" on public.expense_advances for delete
  using (public.can_manage_advances(auth.uid(), org_id));

-- ============================================================
-- Reconciliation (admin): one row per (employee, trip) holding an
-- advance, with the approved expenses settled against it.
-- ============================================================
create or replace function public.get_advance_reconciliation(_org_id uuid)
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  claim_id        uuid,
  trip_title      text,
  advances_total  numeric,
  advances_count  bigint,
  expenses_total  numeric,
  expenses_count  bigint,
  balance         numeric
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.can_manage_advances(auth.uid(), _org_id) then
    raise exception 'Not authorized to view advance reconciliation';
  end if;

  return query
  with adv as (
    select a.user_id u, a.claim_id cl, sum(a.amount) amt, count(*) c
    from public.expense_advances a
    where a.org_id = _org_id
    group by a.user_id, a.claim_id
  ),
  -- approved expenses of the specific trip an advance is tied to
  exp_trip as (
    select c.user_id u, c.id cl,
           coalesce(c.approved_amount, c.total_amount, 0) amt
    from public.travel_expense_claims c
    where c.org_id = _org_id
      and c.status in ('approved', 'partially_approved', 'reimbursed')
  ),
  -- approved expenses with no advance of their own (settle general advances)
  exp_general as (
    select c.user_id u,
           sum(coalesce(c.approved_amount, c.total_amount, 0)) amt, count(*) c
    from public.travel_expense_claims c
    where c.org_id = _org_id
      and c.status in ('approved', 'partially_approved', 'reimbursed')
      and not exists (
        select 1 from public.expense_advances a2 where a2.claim_id = c.id
      )
    group by c.user_id
  )
  select adv.u,
         p.full_name,
         p.email,
         adv.cl,
         tc.trip_title,
         adv.amt,
         adv.c,
         case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end,
         case when adv.cl is null then coalesce(eg.c, 0)   else (case when et.cl is null then 0 else 1 end)::bigint end,
         adv.amt - (case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end)
  from adv
  left join exp_trip    et on et.u = adv.u and et.cl = adv.cl
  left join exp_general eg on eg.u = adv.u and adv.cl is null
  left join public.profiles p on p.id = adv.u
  left join public.travel_expense_claims tc on tc.id = adv.cl
  order by p.full_name nulls last, tc.trip_title nulls first;
end;
$$;

-- ============================================================
-- The signed-in employee's own advance position, per trip.
-- ============================================================
create or replace function public.get_my_advance_summary(_org_id uuid)
returns table (
  claim_id        uuid,
  trip_title      text,
  advances_total  numeric,
  advances_count  bigint,
  expenses_total  numeric,
  expenses_count  bigint,
  balance         numeric
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  return query
  with adv as (
    select a.claim_id cl, sum(a.amount) amt, count(*) c
    from public.expense_advances a
    where a.org_id = _org_id and a.user_id = auth.uid()
    group by a.claim_id
  ),
  exp_trip as (
    select c.id cl, coalesce(c.approved_amount, c.total_amount, 0) amt
    from public.travel_expense_claims c
    where c.org_id = _org_id and c.user_id = auth.uid()
      and c.status in ('approved', 'partially_approved', 'reimbursed')
  ),
  exp_general as (
    select sum(coalesce(c.approved_amount, c.total_amount, 0)) amt, count(*) c
    from public.travel_expense_claims c
    where c.org_id = _org_id and c.user_id = auth.uid()
      and c.status in ('approved', 'partially_approved', 'reimbursed')
      and not exists (
        select 1 from public.expense_advances a2 where a2.claim_id = c.id
      )
  )
  select adv.cl,
         tc.trip_title,
         adv.amt,
         adv.c,
         case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end,
         case when adv.cl is null then coalesce(eg.c, 0)   else (case when et.cl is null then 0 else 1 end)::bigint end,
         adv.amt - (case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end)
  from adv
  left join exp_trip et on et.cl = adv.cl
  left join exp_general eg on adv.cl is null
  order by tc.trip_title nulls first;
end;
$$;

grant execute on function public.get_advance_reconciliation(uuid) to authenticated;
grant execute on function public.get_my_advance_summary(uuid) to authenticated;
grant execute on function public.can_manage_advances(uuid, uuid) to authenticated;
