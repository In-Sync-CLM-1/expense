-- Multiple supporting documents per line item (Project + Gifting claims).
-- receipt_url / receipt_name stay populated with the FIRST file so existing
-- readers (Excel export, RMPL sync) keep working unchanged.
ALTER TABLE public.project_expense_claim_items
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.gifting_expense_claim_items
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.project_expense_claim_items
   SET attachments = jsonb_build_array(jsonb_build_object('url', receipt_url, 'name', COALESCE(receipt_name, 'Document')))
 WHERE receipt_url IS NOT NULL AND attachments = '[]'::jsonb;
UPDATE public.gifting_expense_claim_items
   SET attachments = jsonb_build_array(jsonb_build_object('url', receipt_url, 'name', COALESCE(receipt_name, 'Document')))
 WHERE receipt_url IS NOT NULL AND attachments = '[]'::jsonb;
