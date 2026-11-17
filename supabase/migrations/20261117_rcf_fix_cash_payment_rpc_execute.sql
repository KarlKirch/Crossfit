-- Fix for Rõuge CrossFit: cashier/trainer could not confirm cash payments.
-- API requests returned HTTP 403 (permission denied for function).
-- This does NOT mark any registration as paid; it only makes the existing
-- security-checked RPC callable by authenticated users.
-- Inside the SECURITY DEFINER function, private.wod_is_trainer() still
-- requires an authorized trainer. Anonymous users cannot call it.
REVOKE ALL ON FUNCTION public.wod_set_registration_payment(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wod_set_registration_payment(bigint, boolean)
  TO authenticated;
