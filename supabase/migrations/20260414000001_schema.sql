-- ============================================================
-- Expense Claims System — Full Schema
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null unique,
  full_name   text,
  phone       text,
  reports_to  uuid references public.profiles(id) on delete set null,
  is_active   boolean not null default true,
  exit_date   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── user_roles ────────────────────────────────────────────────
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('admin', 'manager', 'employee')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ── teams ─────────────────────────────────────────────────────
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ── team_members ──────────────────────────────────────────────
create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, team_id)
);

-- ── expense claims ────────────────────────────────────────────
create table if not exists public.travel_expense_claims (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  trip_title       text not null,
  trip_start_date  date not null,
  trip_end_date    date not null,
  destination      text,
  purpose          text,
  total_amount     numeric(12,2) not null default 0,
  approved_amount  numeric(12,2),
  currency         text not null default 'INR',
  status           text not null default 'draft'
                   check (status in (
                     'draft', 'submitted', 'approved',
                     'partially_approved', 'rejected', 'reimbursed'
                   )),
  submitted_at     timestamptz,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  rejection_reason text,
  reimbursed_at    timestamptz,
  proof_urls       jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── expense items ─────────────────────────────────────────────
create table if not exists public.travel_expense_items (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.travel_expense_claims(id) on delete cascade,
  expense_type    text not null
                  check (expense_type in (
                    'airfare','train','bus','cab','auto','fuel',
                    'hotel','food','communication','visa','miscellaneous'
                  )),
  description     text not null default '',
  amount          numeric(12,2) not null,
  expense_date    date not null,
  receipt_url     text,
  receipt_name    text,
  approved_amount numeric(12,2),
  item_status     text default 'pending',
  remarks         text,
  created_at      timestamptz not null default now()
);

-- ── indexes ───────────────────────────────────────────────────
create index if not exists idx_claims_user_id   on public.travel_expense_claims(user_id);
create index if not exists idx_claims_status    on public.travel_expense_claims(status);
create index if not exists idx_claims_submitted on public.travel_expense_claims(submitted_at);
create index if not exists idx_items_claim_id   on public.travel_expense_items(claim_id);
create index if not exists idx_profiles_reports_to on public.profiles(reports_to);

-- ── triggers ──────────────────────────────────────────────────

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger claims_updated_at
  before update on public.travel_expense_claims
  for each row execute function public.set_updated_at();

create or replace trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-recompute claim total_amount when items change
create or replace function public.recalc_claim_total()
returns trigger language plpgsql as $$
declare
  v_claim_id uuid;
begin
  v_claim_id := coalesce(new.claim_id, old.claim_id);
  update public.travel_expense_claims
  set
    total_amount = (
      select coalesce(sum(amount), 0)
      from public.travel_expense_items
      where claim_id = v_claim_id
    ),
    updated_at = now()
  where id = v_claim_id;
  return coalesce(new, old);
end;
$$;

create or replace trigger items_recalc_total
  after insert or update of amount or delete on public.travel_expense_items
  for each row execute function public.recalc_claim_total();

-- Auto-create profile on auth user creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── storage bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

-- ── row-level security ────────────────────────────────────────
alter table public.profiles              enable row level security;
alter table public.user_roles            enable row level security;
alter table public.teams                 enable row level security;
alter table public.team_members          enable row level security;
alter table public.travel_expense_claims enable row level security;
alter table public.travel_expense_items  enable row level security;

-- profiles: own row + admin sees all + managers see direct reports
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
  or exists (
    select 1 from public.profiles sub
    where sub.id = public.profiles.id and sub.reports_to = auth.uid()
  )
);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- user_roles: own rows + admin sees all
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.user_roles ur2
    where ur2.user_id = auth.uid() and ur2.role = 'admin'
  )
);

-- teams: all authenticated users can read
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select using (auth.role() = 'authenticated');

-- team_members: own + admin
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

-- expense claims: own + admin sees all + manager sees subordinates
drop policy if exists "claims_select" on public.travel_expense_claims;
create policy "claims_select" on public.travel_expense_claims for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
  or exists (
    select 1 from public.profiles p
    where p.id = public.travel_expense_claims.user_id
      and p.reports_to = auth.uid()
  )
);
drop policy if exists "claims_insert" on public.travel_expense_claims;
create policy "claims_insert" on public.travel_expense_claims for insert
  with check (user_id = auth.uid());
drop policy if exists "claims_update" on public.travel_expense_claims;
create policy "claims_update" on public.travel_expense_claims for update using (
  user_id = auth.uid()
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'manager')
  )
  or exists (
    select 1 from public.profiles p
    where p.id = public.travel_expense_claims.user_id
      and p.reports_to = auth.uid()
  )
);
drop policy if exists "claims_delete_draft" on public.travel_expense_claims;
create policy "claims_delete_draft" on public.travel_expense_claims for delete using (
  user_id = auth.uid() and status = 'draft'
);

-- expense items: accessible if parent claim is accessible
drop policy if exists "items_select" on public.travel_expense_items;
create policy "items_select" on public.travel_expense_items for select using (
  exists (
    select 1 from public.travel_expense_claims c
    where c.id = travel_expense_items.claim_id
  )
);
drop policy if exists "items_insert" on public.travel_expense_items;
create policy "items_insert" on public.travel_expense_items for insert with check (
  exists (
    select 1 from public.travel_expense_claims c
    where c.id = claim_id and c.user_id = auth.uid()
  )
);
drop policy if exists "items_update" on public.travel_expense_items;
create policy "items_update" on public.travel_expense_items for update using (
  exists (
    select 1 from public.travel_expense_claims c
    where c.id = travel_expense_items.claim_id and c.user_id = auth.uid()
  )
);

-- storage: users upload to their own folder; managers/admins can read
drop policy if exists "receipts_upload" on storage.objects;
create policy "receipts_upload" on storage.objects for insert with check (
  bucket_id = 'expense-receipts'
  and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "receipts_read" on storage.objects;
create policy "receipts_read" on storage.objects for select using (
  bucket_id = 'expense-receipts'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  )
);
drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_delete" on storage.objects for delete using (
  bucket_id = 'expense-receipts'
  and auth.uid()::text = (storage.foldername(name))[1]
);
