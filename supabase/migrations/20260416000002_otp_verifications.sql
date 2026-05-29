-- OTP verifications table for registration dual-channel verification
create table if not exists public.public_otp_verifications (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null default gen_random_uuid(),
  identifier      text not null,
  identifier_type text not null check (identifier_type in ('phone', 'email')),
  otp_code        text not null,
  attempts        int  not null default 0,
  max_attempts    int  not null default 3,
  expires_at      timestamptz not null default (now() + interval '5 minutes'),
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_otp_session_id  on public.public_otp_verifications(session_id);
create index if not exists idx_otp_identifier  on public.public_otp_verifications(identifier);

-- Edge functions use service role key so no user-level RLS needed.
-- Enable RLS to prevent accidental anon reads.
alter table public.public_otp_verifications enable row level security;
