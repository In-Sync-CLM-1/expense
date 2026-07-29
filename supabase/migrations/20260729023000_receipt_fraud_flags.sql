-- Silent fraud-detection flags on expense items, surfaced only to
-- approvers and accounts (never to the submitting employee).
--
-- ai_declared_amount: the amount the AI read directly off the receipt image,
--   captured before the employee could edit the form field. Used to catch
--   someone typing a bigger number than what the receipt actually shows.
-- flag_amount_mismatch: the submitted amount meaningfully exceeds ai_declared_amount.
-- flag_tampering / flag_tampering_reason: the vision model itself noticed
--   signs the receipt image was physically altered (different ink, redrawn
--   digit, correction marks, etc).
ALTER TABLE travel_expense_items
  ADD COLUMN IF NOT EXISTS ai_declared_amount numeric,
  ADD COLUMN IF NOT EXISTS flag_amount_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_tampering boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_tampering_reason text;
