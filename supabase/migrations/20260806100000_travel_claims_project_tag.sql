-- ============================================================
-- Optional project tag on regular Expense Claims (RMPL only)
-- ============================================================
-- RMPL wants regular employee reimbursement claims (travel_expense_claims)
-- that ARE tied to one of their projects to be counted alongside the
-- dedicated Project Expense claims in project-level reporting. Untagged
-- claims (any org, or RMPL claims where the filer didn't pick a project)
-- are treated as the generic "999 / General" bucket at report time —
-- via COALESCE, not a stored default, so existing historical rows don't
-- need to be rewritten.
--
-- Same external-reference pattern as expense_advance_requests.project_id/
-- project_name: RMPL's projects live in a separate Supabase project, so
-- no FK — just a cached id/number/name captured at filing time.

alter table public.travel_expense_claims
  add column if not exists rmpl_project_id uuid,
  add column if not exists project_number text,
  add column if not exists project_name text;

create index if not exists idx_travel_claims_rmpl_project on public.travel_expense_claims(rmpl_project_id);
