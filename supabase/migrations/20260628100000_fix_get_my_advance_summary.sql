-- Fix get_my_advance_summary: travel_expense_claims was joined as `tc` in SELECT
-- and ORDER BY but the LEFT JOIN was missing, causing a runtime error that made the
-- RPC return an error instead of rows. MyAdvanceSummary silently rendered null.

create or replace function public.get_my_advance_summary(_org_id uuid)
returns table (
  claim_id        uuid,
  trip_title      text,
  advances_total  numeric,
  advances_count  bigint,
  expenses_total  numeric,
  expenses_count  bigint,
  balance         numeric
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  return query
  with adv as (
    select a.claim_id cl, sum(a.amount) amt, count(*) c
    from public.expense_advances a
    where a.org_id = _org_id and a.user_id = auth.uid()
    group by a.claim_id
  ),
  exp_trip as (
    select c.id cl, coalesce(c.approved_amount, c.total_amount, 0) amt
    from public.travel_expense_claims c
    where c.org_id = _org_id and c.user_id = auth.uid()
      and c.status in ('approved', 'partially_approved', 'reimbursed')
  ),
  exp_general as (
    select sum(coalesce(c.approved_amount, c.total_amount, 0)) amt, count(*) c
    from public.travel_expense_claims c
    where c.org_id = _org_id and c.user_id = auth.uid()
      and c.status in ('approved', 'partially_approved', 'reimbursed')
      and not exists (
        select 1 from public.expense_advances a2 where a2.claim_id = c.id
      )
  )
  select adv.cl,
         tc.trip_title,
         adv.amt,
         adv.c,
         case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end,
         case when adv.cl is null then coalesce(eg.c, 0)   else (case when et.cl is null then 0 else 1 end)::bigint end,
         adv.amt - (case when adv.cl is null then coalesce(eg.amt, 0) else coalesce(et.amt, 0) end)
  from adv
  left join exp_trip et on et.cl = adv.cl
  left join exp_general eg on adv.cl is null
  left join public.travel_expense_claims tc on tc.id = adv.cl
  order by tc.trip_title nulls first;
end;
$$;
