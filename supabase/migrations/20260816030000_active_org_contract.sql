-- ============================================================
-- The fleet active-organisation contract
-- ============================================================
-- Every app in the fleet now answers "which organisation am I working in"
-- through the same call: set_active_org(uuid), which refuses any organisation
-- the caller is not a member of. This app gets the same contract.
--
-- What is DELIBERATELY not copied from the other apps: they resolve access
-- from an ambient pointer (profiles.org_id / profiles.tenant_id) that RLS
-- reads, which is why that column has to be locked down and why rewriting it
-- was a live cross-tenant hole in three of them.
--
-- This app never had that weakness. Its policies call
-- is_org_member(auth.uid(), row.org_id) per row, so membership is verified on
-- every single query rather than trusted from a pointer. Verified against
-- production: an ordinary member reading another organisation directly gets 0
-- rows, self-granting membership is refused by the INSERT policy, and an org
-- admin repointing their own membership row raises "new row violates
-- row-level security policy".
--
-- So active_org_id here is a PREFERENCE, not an authority: it decides which
-- organisation the UI opens on, and nothing more. Membership checks stay
-- exactly as they are. It is still written only through set_active_org() and
-- still validated against membership — a preference that disagreed with
-- membership would just be confusing.
--
-- The gain is that the choice now follows the person between devices instead
-- of living in one browser's local storage, and the switcher is the same
-- component everywhere.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.active_org_id IS
  'Which organisation the UI opens on. A preference, not an authority: RLS verifies membership per query via is_org_member(). Written only by set_active_org().';

-- Locked for the same reason as everywhere else: a column that steers the
-- session is not something its owner should be able to set by hand, even
-- when nothing security-critical currently reads it.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE UPDATE ON public.profiles FROM authenticated;

-- What the app legitimately writes: StaffProfile-style self edits, and the
-- deactivation toggle used by admin screens.
GRANT UPDATE (
  full_name,
  phone,
  is_active,
  reports_to,
  approver_id,
  exit_date,
  must_change_password,
  updated_at
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION set_active_org(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT is_org_member(v_uid, p_org_id) THEN
    RAISE EXCEPTION 'You are not a member of that organisation';
  END IF;

  UPDATE profiles SET active_org_id = p_org_id WHERE id = v_uid;
  RETURN p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION set_active_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION set_active_org(uuid) TO authenticated;

-- Start everyone on an organisation they actually belong to, so the first
-- load after this change is not blank for anyone.
UPDATE profiles p
   SET active_org_id = (
     SELECT m.org_id FROM org_memberships m
      WHERE m.user_id = p.id AND m.is_active
      ORDER BY m.created_at
      LIMIT 1
   )
 WHERE p.active_org_id IS NULL;
