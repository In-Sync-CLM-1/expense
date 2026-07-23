-- ============================================================
-- Advance requests (maker → approver), mirrors Vendor-Sync's
-- vendor_advance_requests mechanism.
-- ============================================================
-- A maker requests an advance (amount + purpose). Their assigned
-- approver (profiles.approver_id) reviews it, tagging it to a live
-- RMPL project (read-only, from RMPL's own project list) if approved,
-- or rejecting with a comment. Approval does NOT itself hand out
-- money — Accounts still records the actual disbursement via the
-- existing expense_advances ledger (see advance_request_id link
-- added to that table below), same separation Vendor-Sync keeps
-- between "request approved" and "invoice settlement".

create table if not exists public.expense_advance_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount            numeric(12,2) not null check (amount > 0),
  purpose           text not null,
  employee_remarks  text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  project_id        uuid,
  project_name      text,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_comments   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_expense_advance_requests_org      on public.expense_advance_requests(org_id);
create index if not exists idx_expense_advance_requests_user     on public.expense_advance_requests(user_id);
create index if not exists idx_expense_advance_requests_status   on public.expense_advance_requests(status);

create or replace trigger expense_advance_requests_updated_at
  before update on public.expense_advance_requests
  for each row execute function public.set_updated_at();

alter table public.expense_advance_requests enable row level security;

drop policy if exists "advance_requests_select" on public.expense_advance_requests;
create policy "advance_requests_select" on public.expense_advance_requests for select using (
  user_id = auth.uid()
  or public.is_platform_admin(auth.uid())
  or public.can_manage_advances(auth.uid(), org_id)
  or exists (
    select 1 from public.profiles p
    where p.id = expense_advance_requests.user_id
      and p.approver_id = auth.uid()
  )
);

drop policy if exists "advance_requests_insert" on public.expense_advance_requests;
create policy "advance_requests_insert" on public.expense_advance_requests for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.org_memberships
      where user_id = auth.uid() and org_id = expense_advance_requests.org_id and is_active = true
    )
  );

-- Only the maker's own assigned approver, or accounts/admin, may decide it.
drop policy if exists "advance_requests_update" on public.expense_advance_requests;
create policy "advance_requests_update" on public.expense_advance_requests for update using (
  public.is_platform_admin(auth.uid())
  or public.can_manage_advances(auth.uid(), org_id)
  or exists (
    select 1 from public.profiles p
    where p.id = expense_advance_requests.user_id
      and p.approver_id = auth.uid()
  )
) with check (
  public.is_platform_admin(auth.uid())
  or public.can_manage_advances(auth.uid(), org_id)
  or exists (
    select 1 from public.profiles p
    where p.id = expense_advance_requests.user_id
      and p.approver_id = auth.uid()
  )
);

-- ============================================================
-- Link the money-given ledger to the request that authorized it,
-- and let Accounts tag the same RMPL project onto the ledger entry.
-- ============================================================
alter table public.expense_advances
  add column if not exists advance_request_id uuid references public.expense_advance_requests(id) on delete set null,
  add column if not exists project_id   uuid,
  add column if not exists project_name text;

create index if not exists idx_expense_advances_request on public.expense_advances(advance_request_id);
