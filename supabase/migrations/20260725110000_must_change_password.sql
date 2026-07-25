-- Force-change-password-on-next-login flag.
-- When true, the app blocks all access behind a mandatory "set a new
-- password" screen until the user changes it (which clears this flag via
-- the existing profiles_update_own policy). Idempotent.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
