-- The password-reset OTP flow (send-reset-otp / reset-password-with-otp)
-- inserts identifier_type = 'reset_email', but the original check
-- constraint only allowed 'phone' or 'email' — every reset attempt has
-- been failing at the insert with no working reset path since the OTP
-- reset feature shipped. Widen the constraint to match what the app
-- actually writes.
ALTER TABLE public_otp_verifications DROP CONSTRAINT IF EXISTS public_otp_verifications_identifier_type_check;
ALTER TABLE public_otp_verifications ADD CONSTRAINT public_otp_verifications_identifier_type_check
  CHECK (identifier_type = ANY (ARRAY['phone'::text, 'email'::text, 'reset_email'::text]));
