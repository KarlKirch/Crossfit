-- Only Rõuge CrossFit account requests use this dedicated, email-free signup gate.
-- The separate Futbol app and Supabase project-wide authentication settings are untouched.
CREATE TABLE IF NOT EXISTS private.rcf_signup_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.rcf_signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rcf_signup_attempts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS rcf_signup_attempts_ip_time_idx
  ON private.rcf_signup_attempts (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rcf_signup_attempts_email_time_idx
  ON private.rcf_signup_attempts (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rcf_signup_attempts_time_idx
  ON private.rcf_signup_attempts (created_at DESC);

-- Called only by the Edge Function with the service-role key. Never callable
-- from a browser or by ordinary authenticated CrossFit/Futbol accounts.
CREATE OR REPLACE FUNCTION public.rcf_signup_try_slot(
  p_ip_hash text, p_email_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  at_time timestamptz := clock_timestamp();
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Privileged signup endpoint only' USING ERRCODE='42501';
  END IF;
  IF p_ip_hash IS NULL OR p_email_hash IS NULL
      OR p_ip_hash !~ '^[0-9a-f]{64}$'
      OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid signup quota key';
  END IF;

  -- Serialize quota checks; prevent parallel requests bypassing the limit.
  PERFORM pg_catalog.pg_advisory_xact_lock(730010, 882);
  DELETE FROM private.rcf_signup_attempts
    WHERE created_at < at_time - interval '8 days';

  IF (SELECT count(*) FROM private.rcf_signup_attempts
        WHERE ip_hash=p_ip_hash AND created_at > at_time-interval '1 hour') >= 20
     OR (SELECT count(*) FROM private.rcf_signup_attempts
        WHERE ip_hash=p_ip_hash AND created_at > at_time-interval '1 day') >= 60
     OR (SELECT count(*) FROM private.rcf_signup_attempts
        WHERE email_hash=p_email_hash AND created_at > at_time-interval '1 day') >= 3
     OR (SELECT count(*) FROM private.rcf_signup_attempts
        WHERE created_at > at_time-interval '1 day') >= 250
  THEN
    RETURN false;
  END IF;

  INSERT INTO private.rcf_signup_attempts(ip_hash,email_hash,created_at)
    VALUES (p_ip_hash,p_email_hash,at_time);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rcf_signup_try_slot(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rcf_signup_try_slot(text,text)
  TO service_role;
