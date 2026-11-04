-- 2026-11-04: Fix Rõuge CrossFit account creation and trainer-assisted password reset.
-- Modern PostgREST only provides the combined 'request.jwt.claims' JSON GUC.
-- The old 'request.jwt.claim.role' is not populated, causing 503 on every
-- authenticated service-role RPC call (even though the credentials are valid).
--
-- Security: require signed service_role JWT in the PostgREST session;
-- EXECUTE remains revoked from PUBLIC, anon, and authenticated.
-- Does not change Futbol accounts, project-wide Auth settings, or any stored data.

CREATE OR REPLACE FUNCTION public.rcf_signup_try_slot(
  p_ip_hash text, p_email_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  at_time timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
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

CREATE OR REPLACE FUNCTION public.rcf_password_recovery_issue(
  p_user_id uuid, p_code_hash text, p_issued_by uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
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
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
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
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
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
