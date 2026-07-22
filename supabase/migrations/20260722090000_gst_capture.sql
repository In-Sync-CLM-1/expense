-- GST capture on expense items: vendor GSTIN + tax amount, read off the
-- receipt by the AI extractor. Lets an org see recoverable input tax credit
-- that would otherwise go uncaptured in an unstructured claims process.
alter table public.travel_expense_items
  add column if not exists gst_number text,
  add column if not exists gst_amount numeric(12, 2);
