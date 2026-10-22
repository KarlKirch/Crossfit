-- RCF postgres integration fixture. TEST DATABASE ONLY; no live Supabase connectivity.
-- Synthetic schema; the refund RPC definition below was read from production on 2026-10-22.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
CREATE FUNCTION private.wod_is_active_user() RETURNS boolean LANGUAGE sql STABLE
AS $$SELECT current_setting('test.is_active',true)='1'$$;
CREATE FUNCTION private.wod_is_trainer() RETURNS boolean LANGUAGE sql STABLE
AS $$SELECT current_setting('test.is_trainer',true)='1'$$;

CREATE TABLE public.wod_trainings (
  id bigint PRIMARY KEY, title text NOT NULL, starts_at timestamptz NOT NULL,
  status text NOT NULL, archived_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.wod_registrations (
  id bigint PRIMARY KEY, training_id bigint NOT NULL REFERENCES public.wod_trainings(id),
  user_id uuid NOT NULL, status text NOT NULL, credit_charged boolean DEFAULT false,
  cancelled_late boolean DEFAULT false, cancelled_at timestamptz,
  payment_status text DEFAULT 'unpaid', package_instance_id bigint,
  use_package_requested boolean DEFAULT false, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.wod_wallets (
  user_id uuid PRIMARY KEY, credits integer NOT NULL, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.wod_credit_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL, trainer_id uuid NOT NULL,
  delta integer NOT NULL, reason text, amount_cents integer
);
CREATE TABLE public.wod_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL, training_id bigint, kind text, title text, body text,
  url text, tag text, dedupe_key text UNIQUE, due_at timestamptz, sent_at timestamptz
);

-- Exact stored function body obtained read-only from live PostgreSQL.
CREATE OR REPLACE FUNCTION public.wod_cancel_training(p_training_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid := (select auth.uid());
  t public.wod_trainings%rowtype;
  r record;
  local_time text;
  reason_text text;
BEGIN
  IF uid IS NULL OR coalesce((select (auth.jwt()->>'is_anonymous')::boolean),true) THEN
    RAISE EXCEPTION 'CrossFit nõuab e-posti kontoga sisselogimist';
  END IF;
  IF NOT private.wod_is_active_user() OR NOT private.wod_is_trainer() THEN
    RAISE EXCEPTION 'Ainult aktiivne treener saab treeningu tühistada';
  END IF;

  -- Serialise cancellation with registration and other cancellation attempts.
  SELECT * INTO t FROM public.wod_trainings WHERE id=p_training_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF t.status='cancelled' THEN RETURN true; END IF;

  local_time := to_char(t.starts_at AT TIME ZONE 'Europe/Tallinn','DD.MM.YYYY "kell" HH24:MI');

  INSERT INTO public.wod_notifications
    (user_id,training_id,kind,title,body,url,tag,dedupe_key,due_at)
  SELECT r.user_id,p_training_id,'training_cancelled','Treening tühistatud',
         t.title||' '||local_time||' on tühistatud.',
         'https://karlkirch.github.io/Crossfit/',
         'crossfit-cancel-'||p_training_id,
         'cancel:'||p_training_id||':'||r.user_id,now()
  FROM public.wod_registrations r
  WHERE r.training_id=p_training_id
    AND (r.status IN ('confirmed','waitlist') OR r.credit_charged)
  ON CONFLICT(dedupe_key) DO NOTHING;

  DELETE FROM public.wod_notifications
  WHERE training_id=p_training_id AND kind='training_reminder' AND sent_at IS NULL;

  -- Refund every charged registration, including late self-cancellations.
  -- A waitlisted registration was never charged; it receives no extra credit.
  FOR r IN
    SELECT id,user_id
    FROM public.wod_registrations
    WHERE training_id=p_training_id AND credit_charged=true
    FOR UPDATE
  LOOP
    INSERT INTO public.wod_wallets(user_id,credits)
    VALUES(r.user_id,1)
    ON CONFLICT(user_id)
    DO UPDATE SET credits=public.wod_wallets.credits+1,updated_at=now();

    reason_text := left(
      'Tagastus, treening tühistatud: '||t.title||' '||
      to_char(t.starts_at AT TIME ZONE 'Europe/Tallinn','DD.MM.YYYY HH24:MI'),
      120
    );

    INSERT INTO public.wod_credit_transactions
      (user_id,trainer_id,delta,reason,amount_cents)
    VALUES(r.user_id,uid,1,reason_text,null);
  END LOOP;

  UPDATE public.wod_registrations
  SET status='cancelled',
      cancelled_late=false,
      cancelled_at=coalesce(cancelled_at,now()),
      credit_charged=false,
      payment_status='unpaid',
      package_instance_id=null,
      use_package_requested=false,
      updated_at=now()
  WHERE training_id=p_training_id
    AND (status IN ('confirmed','waitlist') OR credit_charged=true);

  UPDATE public.wod_trainings
  SET status='cancelled',updated_at=now()
  WHERE id=p_training_id;

  RETURN true;
END;
$function$
;
