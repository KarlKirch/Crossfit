-- Rõuge CrossFit signup notification migration (2026-11-03).
-- Scoped strictly to CrossFit metadata; the same Auth database also serves Futbol.
CREATE OR REPLACE FUNCTION private.wod_on_crossfit_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  created_user uuid;
  full_name text;
  motivation text;
BEGIN
  IF (NEW.raw_user_meta_data->>'app_identifier' IS DISTINCT FROM 'rouge_crossfit'
      AND NOT (NEW.raw_user_meta_data ? 'join_reason'
               AND NEW.raw_user_meta_data ? 'display_name'))
     OR coalesce(NEW.is_anonymous,false) OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  full_name := nullif(btrim(NEW.raw_user_meta_data->>'display_name'),'');
  IF full_name IS NULL THEN RETURN NEW; END IF;
  motivation := nullif(btrim(left(coalesce(NEW.raw_user_meta_data->>'join_reason',''),300)),'');
  IF EXISTS (SELECT 1 FROM public.wod_removed_clients WHERE user_id=NEW.id) THEN RETURN NEW; END IF;

  INSERT INTO public.wod_profiles(user_id,display_name,join_note)
  VALUES(NEW.id,left(full_name,150),motivation)
  ON CONFLICT(user_id) DO NOTHING
  RETURNING user_id INTO created_user;
  IF created_user IS NOT NULL THEN
    INSERT INTO public.wod_wallets(user_id,credits)
    VALUES(created_user,0) ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO public.wod_notifications(user_id,kind,title,body,tag,dedupe_key,due_at)
    SELECT p.user_id,'join_request','Uus liitumistaotlus',
      left(full_name,150)||' soovib liituda Rõuge CrossFitiga. E-posti kinnitus võib olla veel ootel.',
      'crossfit-join-'||NEW.id,'join-request:'||NEW.id,now()
    FROM public.wod_profiles p
    WHERE p.role='trainer' AND p.approval_status='approved'
    ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break Supabase Auth signups of this app or the independent Futbol app.
  RAISE WARNING 'CrossFit signup side effect failed (SQLSTATE %)', SQLSTATE;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.wod_on_crossfit_signup() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wod_crossfit_signup_trg ON auth.users;
CREATE TRIGGER wod_crossfit_signup_trg
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.wod_on_crossfit_signup();

-- New RPC leaves the existing clients of wod_list_join_requests() untouched.
CREATE OR REPLACE FUNCTION public.wod_list_join_requests_v2()
RETURNS TABLE(client_id uuid,display_name text,email text,join_note text,
              created_at timestamptz,approval_status text,email_verified boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.wod_is_trainer()) THEN
    RAISE EXCEPTION 'Ainult treener saab vaadata liitumistaotlusi';
  END IF;
  RETURN QUERY
    SELECT p.user_id,p.display_name,u.email::text,p.join_note,p.created_at,
           p.approval_status,(u.email_confirmed_at IS NOT NULL)
    FROM public.wod_profiles p
    JOIN auth.users u ON u.id=p.user_id
    WHERE p.role='client' AND p.approval_status IN ('pending','rejected')
      AND NOT EXISTS(SELECT 1 FROM public.wod_removed_clients r WHERE r.user_id=p.user_id)
    ORDER BY (p.approval_status='pending') DESC,p.created_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.wod_list_join_requests_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_list_join_requests_v2() TO authenticated;

-- Server-side enforcement: even a direct RPC call cannot approve an unverified email.
CREATE OR REPLACE FUNCTION private.wod_verified_email_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.role='client' AND NEW.approval_status='approved'
     AND OLD.approval_status IS DISTINCT FROM 'approved'
     AND NOT EXISTS (
       SELECT 1 FROM auth.users u
       WHERE u.id=NEW.user_id AND u.email_confirmed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Konto e-posti aadress tuleb enne liitumise kinnitamist kinnitada';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.wod_verified_email_before_approval() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wod_verified_email_approval_trg ON public.wod_profiles;
CREATE TRIGGER wod_verified_email_approval_trg
BEFORE UPDATE OF approval_status ON public.wod_profiles
FOR EACH ROW EXECUTE FUNCTION private.wod_verified_email_before_approval();

-- Restore previously submitted CrossFit signup(s) that are missing a profile
-- and registration notification. The join_reason key is unique to the old
-- CrossFit signup form, not Futbol.
WITH candidates AS (
  SELECT u.id,
         left(btrim(u.raw_user_meta_data->>'display_name'),150) AS full_name,
         nullif(btrim(left(coalesce(u.raw_user_meta_data->>'join_reason',''),300)),'') AS motivation
  FROM auth.users u
  WHERE u.raw_user_meta_data ? 'join_reason'
    AND nullif(btrim(u.raw_user_meta_data->>'display_name'),'') IS NOT NULL
    AND NOT coalesce(u.is_anonymous,false)
    AND NOT EXISTS (SELECT 1 FROM public.wod_profiles p WHERE p.user_id=u.id)
    AND NOT EXISTS (SELECT 1 FROM public.wod_removed_clients r WHERE r.user_id=u.id)
), created AS (
  INSERT INTO public.wod_profiles(user_id,display_name,join_note)
  SELECT id,full_name,motivation FROM candidates
  ON CONFLICT(user_id) DO NOTHING
  RETURNING user_id,display_name
), wallets AS (
  INSERT INTO public.wod_wallets(user_id,credits)
  SELECT user_id,0 FROM created ON CONFLICT(user_id) DO NOTHING
  RETURNING user_id
), notices AS (
  INSERT INTO public.wod_notifications(user_id,kind,title,body,tag,dedupe_key,due_at)
  SELECT trainer.user_id,'join_request','Uus liitumistaotlus',
         client.display_name||' soovib liituda Rõuge CrossFitiga. E-posti kinnitus võib olla veel ootel.',
         'crossfit-join-'||client.user_id,
         'join-request:'||client.user_id,now()
  FROM created client
  CROSS JOIN public.wod_profiles trainer
  WHERE trainer.role='trainer' AND trainer.approval_status='approved'
  ON CONFLICT(dedupe_key) DO NOTHING
  RETURNING user_id
)
SELECT (SELECT count(*) FROM created) AS recovered_requests,
       (SELECT count(*) FROM notices) AS queued_trainer_notifications;
