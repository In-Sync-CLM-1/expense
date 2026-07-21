-- API keys for org-scoped read-only reporting access (client apps like RMPL
-- pull expense/advance reports through the public-api function using one of
-- these, the same pattern already live in Vendor-Sync). Service-role only —
-- no client-side policy is granted since the public-api function is the sole
-- reader/writer and always uses the service role key.
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  key_hash     text not null unique,
  label        text,
  is_active    boolean not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_api_keys_org_id on public.api_keys(org_id);

alter table public.api_keys enable row level security;
