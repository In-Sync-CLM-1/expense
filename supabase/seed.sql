-- ============================================================
-- Platform Admin Seed
-- ============================================================
-- Run this AFTER creating the auth user a@in-sync.co.in via
-- Supabase Auth (Dashboard → Authentication → Users → Invite/Create).
--
-- Credentials to set:
--   Email:    a@in-sync.co.in
--   Password: Blizz26ard#
--   Name:     Amit Sengupta
--
-- Then execute this SQL in the Supabase SQL editor:
-- ============================================================

insert into public.user_roles (user_id, role)
select id, 'platform_admin'
from auth.users
where email = 'a@in-sync.co.in'
on conflict (user_id, role) do nothing;

-- Also update the profile name if not set by trigger
update public.profiles
set full_name = 'Amit Sengupta'
where id = (select id from auth.users where email = 'a@in-sync.co.in')
  and (full_name is null or full_name = 'a');
