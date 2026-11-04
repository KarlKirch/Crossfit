-- Rõuge CrossFit: treeneri väljastatav ühekordne paroolitaaste.
-- Futboli kasutajad, funktsioonid ja globaalsed Auth/SMTP seaded jäävad muutmata.
CREATE TABLE IF NOT EXISTS private.rcf_password_recovery (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5)
);
ALTER TABLE private.rcf_password_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rcf_password_recovery FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.rcf_password_recovery_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.rcf_password_recovery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rcf_password_recovery_attempts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS rcf_recovery_attempts_ip_time_idx
  ON private.rcf_password_recovery_attempts (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rcf_recovery_attempts_email_time_idx
  ON private.rcf_password_recovery_attempts (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rcf_recovery_attempts_time_idx
  ON private.rcf_password_recovery_attempts (created_at DESC);

CREATE OR REPLACE FUNCTION public.rcf_password_recovery_issue(
  p_user_id uuid, p_code_hash text, p_issued_by uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_issued_by IS NULL
     OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wod_profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.user_id = p_user_id AND p.role = 'client'
      AND p.approval_status = 'approved' AND u.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wod_removed_clients r WHERE r.user_id = p_user_id
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM public.wod_profiles p WHERE p.user_id = p_issued_by
      AND p.role = 'trainer' AND p.approval_status = 'approved'
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO private.rcf_password_recovery(
    user_id, code_hash, issued_by, issued_at, expires_at, failed_attempts
  ) VALUES (p_user_id, p_code_hash, p_issued_by, now(), now() + interval '24 hours', 0)
  ON CONFLICT (user_id) DO UPDATE
    SET code_hash = excluded.code_hash, issued_by = excluded.issued_by,
        issued_at = excluded.issued_at, expires_at = excluded.expires_at,
        failed_attempts = 0
    WHERE private.rcf_password_recovery.issued_at <= now() - interval '60 seconds'
      OR private.rcf_password_recovery.expires_at <= now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.rcf_password_recovery_issue(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rcf_password_recovery_issue(uuid,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.rcf_password_recovery_allow_attempt(
  p_ip_hash text, p_email_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_ip_hash IS NULL OR p_email_hash IS NULL
    OR p_ip_hash !~ '^[0-9a-f]{64}$' OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(730011, 24);
  DELETE FROM private.rcf_password_recovery_attempts
    WHERE created_at < v_now - interval '2 days';
  IF (SELECT count(*) FROM private.rcf_password_recovery_attempts
      WHERE ip_hash = p_ip_hash AND created_at > v_now - interval '1 hour') >= 20
    OR (SELECT count(*) FROM private.rcf_password_recovery_attempts
      WHERE email_hash = p_email_hash AND created_at > v_now - interval '1 hour') >= 10
    OR (SELECT count(*) FROM private.rcf_password_recovery_attempts
      WHERE created_at > v_now - interval '1 hour') >= 200
  THEN
    RETURN false;
  END IF;
  INSERT INTO private.rcf_password_recovery_attempts(ip_hash,email_hash,created_at)
    VALUES (p_ip_hash,p_email_hash,v_now);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rcf_password_recovery_allow_attempt(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rcf_password_recovery_allow_attempt(text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.rcf_password_recovery_claim(
  p_email text, p_code_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_hash text; v_expires timestamptz; v_failed integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(p_email) > 254 OR p_code_hash IS NULL
    OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  SELECT r.user_id, r.code_hash, r.expires_at, r.failed_attempts
    INTO v_uid, v_hash, v_expires, v_failed
  FROM private.rcf_password_recovery r
  JOIN auth.users a ON a.id = r.user_id
  JOIN public.wod_profiles p ON p.user_id = r.user_id
  WHERE lower(a.email) = lower(btrim(p_email)) AND p.role = 'client'
    AND p.approval_status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.wod_removed_clients rm WHERE rm.user_id = r.user_id
    )
  FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_expires <= clock_timestamp() OR v_failed >= 5 THEN
    DELETE FROM private.rcf_password_recovery WHERE user_id = v_uid;
    RETURN NULL;
  END IF;
  IF v_hash <> p_code_hash THEN
    IF v_failed >= 4 THEN
      DELETE FROM private.rcf_password_recovery WHERE user_id = v_uid;
    ELSE
      UPDATE private.rcf_password_recovery
        SET failed_attempts = v_failed + 1 WHERE user_id = v_uid;
    END IF;
    RETURN NULL;
  END IF;
  DELETE FROM private.rcf_password_recovery WHERE user_id = v_uid;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.rcf_password_recovery_claim(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rcf_password_recovery_claim(text,text)
  TO service_role;
