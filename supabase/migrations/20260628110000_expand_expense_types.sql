-- Expand expense_type check constraint from travel-specific to generic
alter table public.travel_expense_items
  drop constraint if exists travel_expense_items_expense_type_check;

alter table public.travel_expense_items
  add constraint travel_expense_items_expense_type_check
  check (expense_type in (
    'airfare','train','bus','cab','auto','fuel',
    'hotel','food','communication','visa','miscellaneous',
    'accommodation','office_supplies','software','equipment',
    'training','entertainment','medical'
  ));
