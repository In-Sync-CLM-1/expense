-- ============================================================
-- Amit belongs to every organisation
-- ============================================================
-- He is platform admin AND a working member of each organisation. With no
-- org_memberships row he was console-only, so arriving from RMPL's launcher
-- dropped him on the platform Command Center instead of a workspace.
--
-- Membership and switching already exist here (org_memberships + the org
-- switcher); only the rows were missing.
-- Idempotent.
-- ============================================================

DO $$
DECLARE
  v_uid uuid;
  v_org record;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'a@in-sync.co.in';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'a@in-sync.co.in not present — skipping';
    RETURN;
  END IF;

  FOR v_org IN SELECT id FROM organizations LOOP
    INSERT INTO org_memberships (user_id, org_id, role, is_active)
    SELECT v_uid, v_org.id, 'admin', true
     WHERE NOT EXISTS (
       SELECT 1 FROM org_memberships WHERE user_id = v_uid AND org_id = v_org.id
     );
  END LOOP;
END $$;
