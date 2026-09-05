-- ============================================================
-- Self-approval flag
-- ============================================================
-- A maker flagged auto_approve_own_claims skips the approval queue
-- entirely — their own submission IS the final approval, across every
-- claim type (travel claims, RMPL project expense claims, advance
-- requests). Their assigned approver is unchanged and still approves
-- everyone else's claims as normal.
--
-- First use: Brijesh Kumar Verma (Redefine Marcom) — his own claims
-- no longer wait on his manager Sandipan Ray.

alter table public.profiles
  add column if not exists auto_approve_own_claims boolean not null default false;

-- ── Travel expense claims ──
create or replace function public.auto_approve_own_travel_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (old.status is distinct from 'submitted') then
    if exists (
      select 1 from public.profiles
      where id = new.user_id and auto_approve_own_claims = true
    ) then
      new.status := 'approved';
      new.approved_by := new.user_id;
      new.approved_at := now();
      new.approved_amount := coalesce(new.approved_amount, new.total_amount);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_own_travel_claim on public.travel_expense_claims;
create trigger trg_auto_approve_own_travel_claim
  before update on public.travel_expense_claims
  for each row execute function public.auto_approve_own_travel_claim();

-- ── RMPL project expense claims ──
create or replace function public.auto_approve_own_project_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (old.status is distinct from 'submitted') then
    if exists (
      select 1 from public.profiles
      where id = new.user_id and auto_approve_own_claims = true
    ) then
      new.status := 'approved';
      new.approved_by := new.user_id;
      new.approved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_own_project_claim on public.project_expense_claims;
create trigger trg_auto_approve_own_project_claim
  before update on public.project_expense_claims
  for each row execute function public.auto_approve_own_project_claim();

-- ── Advance requests (no draft state — land at insert as 'pending') ──
create or replace function public.auto_approve_own_advance_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    if exists (
      select 1 from public.profiles
      where id = new.user_id and auto_approve_own_claims = true
    ) then
      new.status := 'approved';
      new.reviewed_by := new.user_id;
      new.reviewed_at := now();
      new.review_comments := coalesce(new.review_comments, 'Auto-approved (self-approval policy)');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_own_advance_request on public.expense_advance_requests;
create trigger trg_auto_approve_own_advance_request
  before insert on public.expense_advance_requests
  for each row execute function public.auto_approve_own_advance_request();

-- ── Turn it on for Brijesh Kumar Verma (Redefine Marcom) ──
update public.profiles
set auto_approve_own_claims = true
where email = 'brijesh.verma@redefine.in';
