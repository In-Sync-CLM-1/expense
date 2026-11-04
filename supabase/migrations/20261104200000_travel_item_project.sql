-- Work-Sync TASK-2780: each expense line carries its own RMPL project.
-- Same external-reference pattern as travel_expense_claims: RMPL's projects live
-- in a separate Supabase project, so there is no FK, just a cached id/number/name
-- captured at filing time. Older lines stay blank and use their claim's project.
alter table public.travel_expense_items
  add column if not exists rmpl_project_id uuid,
  add column if not exists project_number text,
  add column if not exists project_name text;

create index if not exists idx_travel_items_project_number on public.travel_expense_items(project_number);
