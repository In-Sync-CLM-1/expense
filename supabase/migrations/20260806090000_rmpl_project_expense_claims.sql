-- ============================================================
-- RMPL-only "Project Expense" claim type
-- ============================================================
-- Models RMPL's own "Outing Activity" paper sheet: a claim tied to one
-- of RMPL's live projects, filed against a specific line-item shape
-- (Local Conveyance / Event Expense / Refreshment / Other), each line
-- carrying its own supporting-document upload, plus a travel log.
--
-- Approval is NOT via profiles.approver_id like travel_expense_claims —
-- it routes to that specific project's Project Owner (resolved from
-- RMPL's own projects.project_owner, matched into this app's profiles
-- by email — see list-rmpl-projects edge function). Once the Project
-- Owner approves, Accounts/Admin can see it for payment, same as the
-- existing travel-claim reimbursement flow.
--
-- Hard-locked to the RMPL org (org_id check constraint) — this claim
-- type only ever exists for that tenant.

create table if not exists public.project_expense_claims (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade
                           check (org_id = 'c5f6b811-b6a9-4165-8125-3d4dc6b5bf9a'),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  traveller_name           text not null,

  -- RMPL's own project (a separate Supabase project — no FK possible,
  -- these are a read-only cached copy of what was picked at filing time)
  rmpl_project_id          uuid not null,
  project_number           text,
  project_name             text not null,
  project_owner_external_id uuid,
  project_owner_user_id    uuid references public.profiles(id) on delete set null,
  project_owner_name       text,
  project_owner_email      text,

  activity                 text,
  city                     text,
  period                   text,

  -- Advance Received is pulled from an actual disbursed advance
  -- (expense_advances), not typed in freehand.
  advance_id               uuid references public.expense_advances(id) on delete set null,
  advance_amount           numeric(12,2) not null default 0,

  actual_expense_total     numeric(12,2) not null default 0,
  net_balance              numeric(12,2) generated always as (advance_amount - actual_expense_total) stored,

  status                   text not null default 'draft'
                           check (status in ('draft', 'submitted', 'approved', 'rejected', 'reimbursed')),
  submitted_at             timestamptz,
  approved_by              uuid references public.profiles(id) on delete set null,
  approved_at              timestamptz,
  rejection_reason         text,
  reimbursed_at            timestamptz,
  reimbursed_by            uuid references public.profiles(id) on delete set null,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.project_expense_claim_items (
  id                 uuid primary key default gen_random_uuid(),
  claim_id           uuid not null references public.project_expense_claims(id) on delete cascade,
  line_date          date not null,
  description        text not null default '',
  mode_of_transport  text,
  local_conveyance   numeric(12,2) not null default 0,
  event_expense      numeric(12,2) not null default 0,
  refreshment        numeric(12,2) not null default 0,
  other_expense      numeric(12,2) not null default 0,
  grand_total        numeric(12,2) generated always as
                      (local_conveyance + event_expense + refreshment + other_expense) stored,
  receipt_url        text,
  receipt_name       text,
  remarks            text,
  created_at         timestamptz not null default now()
);

create table if not exists public.project_expense_travel_logs (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.project_expense_claims(id) on delete cascade,
  travel_date  date,
  from_place   text,
  to_place     text,
  mode         text,
  place        text,
  total        numeric(12,2) not null default 0,
  created_at   timestamptz not null default now()
);

-- Marks a disbursed advance as consumed by a Project Expense claim
-- (mirrors the existing expense_advances.claim_id -> travel_expense_claims link).
alter table public.expense_advances
  add column if not exists project_claim_id uuid references public.project_expense_claims(id) on delete set null;

-- ── indexes ───────────────────────────────────────────────────
create index if not exists idx_pe_claims_user_id            on public.project_expense_claims(user_id);
create index if not exists idx_pe_claims_org_id              on public.project_expense_claims(org_id);
create index if not exists idx_pe_claims_status              on public.project_expense_claims(status);
create index if not exists idx_pe_claims_project_owner       on public.project_expense_claims(project_owner_user_id);
create index if not exists idx_pe_claim_items_claim_id       on public.project_expense_claim_items(claim_id);
create index if not exists idx_pe_travel_logs_claim_id       on public.project_expense_travel_logs(claim_id);
create index if not exists idx_expense_advances_project_claim on public.expense_advances(project_claim_id);

-- ── triggers ──────────────────────────────────────────────────
create or replace trigger project_expense_claims_updated_at
  before update on public.project_expense_claims
  for each row execute function public.set_updated_at();

create or replace function public.recalc_project_expense_claim_total()
returns trigger language plpgsql as $$
declare
  v_claim_id uuid;
begin
  v_claim_id := coalesce(new.claim_id, old.claim_id);
  update public.project_expense_claims
  set
    actual_expense_total = (
      select coalesce(sum(grand_total), 0)
      from public.project_expense_claim_items
      where claim_id = v_claim_id
    ),
    updated_at = now()
  where id = v_claim_id;
  return coalesce(new, old);
end;
$$;

create or replace trigger pe_items_recalc_total
  after insert or update of local_conveyance, event_expense, refreshment, other_expense or delete
  on public.project_expense_claim_items
  for each row execute function public.recalc_project_expense_claim_total();

-- ── row-level security ────────────────────────────────────────
alter table public.project_expense_claims       enable row level security;
alter table public.project_expense_claim_items  enable row level security;
alter table public.project_expense_travel_logs  enable row level security;

drop policy if exists "pe_claims_select" on public.project_expense_claims;
create policy "pe_claims_select" on public.project_expense_claims for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or project_owner_user_id = auth.uid()
  or exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = project_expense_claims.org_id
      and org_memberships.roles && array['admin', 'accounts']::text[]
      and org_memberships.is_active
  )
);

drop policy if exists "pe_claims_insert" on public.project_expense_claims;
create policy "pe_claims_insert" on public.project_expense_claims for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = project_expense_claims.org_id
      and org_memberships.is_active
  )
);

drop policy if exists "pe_claims_update" on public.project_expense_claims;
create policy "pe_claims_update" on public.project_expense_claims for update using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or project_owner_user_id = auth.uid()
  or exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = project_expense_claims.org_id
      and org_memberships.roles && array['admin', 'accounts']::text[]
      and org_memberships.is_active
  )
);

drop policy if exists "pe_claims_delete" on public.project_expense_claims;
create policy "pe_claims_delete" on public.project_expense_claims for delete using (
  user_id = auth.uid() and status = 'draft'
);

drop policy if exists "pe_claim_items_all" on public.project_expense_claim_items;
create policy "pe_claim_items_all" on public.project_expense_claim_items for all using (
  exists (
    select 1 from public.project_expense_claims c
    where c.id = project_expense_claim_items.claim_id
      and (
        public.is_platform_admin(auth.uid())
        or c.user_id = auth.uid()
        or c.project_owner_user_id = auth.uid()
        or exists (
          select 1 from public.org_memberships
          where org_memberships.user_id = auth.uid()
            and org_memberships.org_id = c.org_id
            and org_memberships.roles && array['admin', 'accounts']::text[]
            and org_memberships.is_active
        )
      )
  )
) with check (
  exists (
    select 1 from public.project_expense_claims c
    where c.id = project_expense_claim_items.claim_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "pe_travel_logs_all" on public.project_expense_travel_logs;
create policy "pe_travel_logs_all" on public.project_expense_travel_logs for all using (
  exists (
    select 1 from public.project_expense_claims c
    where c.id = project_expense_travel_logs.claim_id
      and (
        public.is_platform_admin(auth.uid())
        or c.user_id = auth.uid()
        or c.project_owner_user_id = auth.uid()
        or exists (
          select 1 from public.org_memberships
          where org_memberships.user_id = auth.uid()
            and org_memberships.org_id = c.org_id
            and org_memberships.roles && array['admin', 'accounts']::text[]
            and org_memberships.is_active
        )
      )
  )
) with check (
  exists (
    select 1 from public.project_expense_claims c
    where c.id = project_expense_travel_logs.claim_id
      and c.user_id = auth.uid()
  )
);
