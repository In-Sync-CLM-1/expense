-- ============================================================
-- RMPL-only "Gifting Expense" claim type
-- ============================================================
-- Brijesh Verma (and anyone else filing gifting spend) buys gifts for
-- several client projects in one trip/period and works from a single
-- spreadsheet that names a different RMPL project on every row. That
-- doesn't fit project_expense_claims (one project per claim, approved
-- by that project's Project Owner) — so this is a separate claim type
-- where each LINE carries its own project, not the claim header.
--
-- No approval step: per the user, this goes straight from filed to
-- ready-for-payment. There's no single Project Owner to route a
-- multi-project claim to anyway. Accounts/Admin marks it paid, same as
-- the existing reimbursement flow.
--
-- On submit, the expense app pushes each project's slice of the claim
-- into RMPL's own project_expense_submissions (tagged "Gifting &
-- Merchandise"), so it lands in that project's A-factor exactly like a
-- submission made directly inside RMPL — see sync-gifting-expense-to-rmpl.
--
-- Hard-locked to the RMPL org, same as project_expense_claims.

create table if not exists public.gifting_expense_claims (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade
                     check (org_id = 'c5f6b811-b6a9-4165-8125-3d4dc6b5bf9a'),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  filer_name         text not null,
  period             text,

  total_amount       numeric(12,2) not null default 0,

  status             text not null default 'draft'
                     check (status in ('draft', 'submitted', 'reimbursed')),
  submitted_at       timestamptz,
  reimbursed_at      timestamptz,
  reimbursed_by      uuid references public.profiles(id) on delete set null,

  -- Set once every line has been pushed into RMPL's project_expense_submissions,
  -- so a retry (or re-invoking the sync function) can never double-count.
  synced_to_rmpl_at  timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.gifting_expense_claim_items (
  id                uuid primary key default gen_random_uuid(),
  claim_id          uuid not null references public.gifting_expense_claims(id) on delete cascade,
  line_date         date not null,

  -- RMPL's own project (a separate Supabase project — no FK possible),
  -- resolved per-line at filing time via list-rmpl-projects, same as
  -- project_expense_claims caches it at the claim header level.
  rmpl_project_id   uuid not null,
  project_number    text,
  project_name      text not null,

  recipient         text,
  description       text not null default '',
  amount            numeric(12,2) not null default 0,

  receipt_url       text,
  receipt_name      text,

  created_at        timestamptz not null default now()
);

-- ── indexes ───────────────────────────────────────────────────
create index if not exists idx_ge_claims_user_id      on public.gifting_expense_claims(user_id);
create index if not exists idx_ge_claims_org_id        on public.gifting_expense_claims(org_id);
create index if not exists idx_ge_claims_status        on public.gifting_expense_claims(status);
create index if not exists idx_ge_claim_items_claim_id on public.gifting_expense_claim_items(claim_id);
create index if not exists idx_ge_claim_items_project  on public.gifting_expense_claim_items(rmpl_project_id);

-- ── triggers ──────────────────────────────────────────────────
create or replace trigger gifting_expense_claims_updated_at
  before update on public.gifting_expense_claims
  for each row execute function public.set_updated_at();

create or replace function public.recalc_gifting_expense_claim_total()
returns trigger language plpgsql as $$
declare
  v_claim_id uuid;
begin
  v_claim_id := coalesce(new.claim_id, old.claim_id);
  update public.gifting_expense_claims
  set
    total_amount = (
      select coalesce(sum(amount), 0)
      from public.gifting_expense_claim_items
      where claim_id = v_claim_id
    ),
    updated_at = now()
  where id = v_claim_id;
  return coalesce(new, old);
end;
$$;

create or replace trigger ge_items_recalc_total
  after insert or update of amount or delete
  on public.gifting_expense_claim_items
  for each row execute function public.recalc_gifting_expense_claim_total();

-- ── row-level security ────────────────────────────────────────
alter table public.gifting_expense_claims       enable row level security;
alter table public.gifting_expense_claim_items  enable row level security;

drop policy if exists "ge_claims_select" on public.gifting_expense_claims;
create policy "ge_claims_select" on public.gifting_expense_claims for select using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = gifting_expense_claims.org_id
      and org_memberships.roles && array['admin', 'accounts']::text[]
      and org_memberships.is_active
  )
);

drop policy if exists "ge_claims_insert" on public.gifting_expense_claims;
create policy "ge_claims_insert" on public.gifting_expense_claims for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = gifting_expense_claims.org_id
      and org_memberships.is_active
  )
);

drop policy if exists "ge_claims_update" on public.gifting_expense_claims;
create policy "ge_claims_update" on public.gifting_expense_claims for update using (
  public.is_platform_admin(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1 from public.org_memberships
    where org_memberships.user_id = auth.uid()
      and org_memberships.org_id = gifting_expense_claims.org_id
      and org_memberships.roles && array['admin', 'accounts']::text[]
      and org_memberships.is_active
  )
);

drop policy if exists "ge_claims_delete" on public.gifting_expense_claims;
create policy "ge_claims_delete" on public.gifting_expense_claims for delete using (
  user_id = auth.uid() and status = 'draft'
);

drop policy if exists "ge_claim_items_all" on public.gifting_expense_claim_items;
create policy "ge_claim_items_all" on public.gifting_expense_claim_items for all using (
  exists (
    select 1 from public.gifting_expense_claims c
    where c.id = gifting_expense_claim_items.claim_id
      and (
        public.is_platform_admin(auth.uid())
        or c.user_id = auth.uid()
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
    select 1 from public.gifting_expense_claims c
    where c.id = gifting_expense_claim_items.claim_id
      and c.user_id = auth.uid()
  )
);
