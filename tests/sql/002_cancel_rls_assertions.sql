-- These scenarios are run against the disposable GitHub Actions Postgres service.
-- No network calls to Supabase; IDs below are synthetic.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.wod_trainings(id,title,starts_at,status)
VALUES (101,'Test-WOD',now()+interval '2 days','published'),
       (102,'Muutmata testtreening',now()+interval '4 days','published');

INSERT INTO public.wod_wallets(user_id,credits)
VALUES ('22222222-2222-4222-8222-222222222222',2),
       ('33333333-3333-4333-8333-333333333333',0),
       ('44444444-4444-4444-8444-444444444444',1);

INSERT INTO public.wod_registrations(id,training_id,user_id,status,credit_charged,cancelled_late,payment_status)
VALUES (1,101,'22222222-2222-4222-8222-222222222222','confirmed',true,false,'credit'),
       (2,101,'33333333-3333-4333-8333-333333333333','cancelled',true,true,'credit'),
       (3,101,'44444444-4444-4444-8444-444444444444','waitlist',false,false,'unpaid');

SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":false}',true);
SELECT set_config('test.is_active','1',true);
SELECT set_config('test.is_trainer','0',true);

DO $$
DECLARE rejected bool:=false;
BEGIN
  BEGIN
    PERFORM public.wod_cancel_training(101);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Ainult aktiivne treener%' THEN rejected:=true;
    ELSE RAISE; END IF;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Client cancelled a trainer-only session'; END IF;
  IF (SELECT status FROM public.wod_trainings WHERE id=101)<>'published'
    THEN RAISE EXCEPTION 'Client mutated session despite rejection'; END IF;
END $$;

SELECT set_config('test.is_trainer','1',true);
DO $$
BEGIN
  IF NOT public.wod_cancel_training(101) THEN RAISE EXCEPTION 'Trainer cancel returned false'; END IF;
  IF (SELECT status FROM public.wod_trainings WHERE id=101)<>'cancelled'
    THEN RAISE EXCEPTION 'Session was not cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM public.wod_registrations WHERE training_id=101 AND credit_charged)
    THEN RAISE EXCEPTION 'Charged registration remains after cancellation'; END IF;
  IF EXISTS (SELECT 1 FROM public.wod_registrations WHERE training_id=101 AND status<>'cancelled')
    THEN RAISE EXCEPTION 'Not every participant is cancelled'; END IF;
  IF (SELECT credits FROM public.wod_wallets WHERE user_id='22222222-2222-4222-8222-222222222222')<>3
    OR (SELECT credits FROM public.wod_wallets WHERE user_id='33333333-3333-4333-8333-333333333333')<>1
    OR (SELECT credits FROM public.wod_wallets WHERE user_id='44444444-4444-4444-8444-444444444444')<>1
    THEN RAISE EXCEPTION 'Credit refunds incorrect, including late cancel or waitlist'; END IF;
  IF (SELECT count(*) FROM public.wod_credit_transactions)<>2
    THEN RAISE EXCEPTION 'Expected one credit transaction per charged registration'; END IF;
  IF (SELECT count(*) FROM public.wod_notifications WHERE kind='training_cancelled')<>3
    THEN RAISE EXCEPTION 'Expected all participant notifications'; END IF;
  IF (SELECT status FROM public.wod_trainings WHERE id=102)<>'published'
    THEN RAISE EXCEPTION 'Cancellation affected unrelated training'; END IF;
  IF NOT public.wod_cancel_training(101) THEN RAISE EXCEPTION 'Idempotent cancel returned false'; END IF;
  IF (SELECT count(*) FROM public.wod_credit_transactions)<>2
    OR (SELECT sum(credits) FROM public.wod_wallets)<>5
    THEN RAISE EXCEPTION 'Double credit refund on repeat cancellation'; END IF;
END $$;

-- Mirrored core production RLS: ownership, trainer override, permanent active accounts.
ALTER TABLE public.wod_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wod_credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wod_wallets,public.wod_credit_transactions FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA auth,private TO authenticated;
GRANT SELECT ON public.wod_wallets,public.wod_credit_transactions TO authenticated;
CREATE POLICY wod_wallets_read_self_or_trainer ON public.wod_wallets
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR (SELECT private.wod_is_trainer()));
CREATE POLICY wod_credit_transactions_read_own_or_trainer ON public.wod_credit_transactions
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR (SELECT private.wod_is_trainer()));
CREATE POLICY wod_active_wallet ON public.wod_wallets AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.wod_is_active_user()))
  WITH CHECK ((SELECT private.wod_is_active_user()));
CREATE POLICY wod_active_transactions ON public.wod_credit_transactions AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.wod_is_active_user()))
  WITH CHECK ((SELECT private.wod_is_active_user()));
CREATE POLICY wod_wallets_permanent_only ON public.wod_wallets AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,true) IS FALSE)
  WITH CHECK (coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,true) IS FALSE);
CREATE POLICY wod_credit_transactions_permanent_only ON public.wod_credit_transactions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,true) IS FALSE)
  WITH CHECK (coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,true) IS FALSE);

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT set_config('test.is_trainer','0',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE denied bool:=false;
BEGIN
  IF (SELECT count(*) FROM public.wod_wallets)<>1
    THEN RAISE EXCEPTION 'Client can read other wallets'; END IF;
  IF (SELECT count(*) FROM public.wod_credit_transactions)<>1
    THEN RAISE EXCEPTION 'Client can read others credit history'; END IF;
  BEGIN
    UPDATE public.wod_wallets SET credits=999;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Client can update credits directly'; END IF;
END $$;
RESET ROLE;

SELECT set_config('test.is_trainer','1',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wod_wallets)<>3
    OR (SELECT count(*) FROM public.wod_credit_transactions)<>2
    THEN RAISE EXCEPTION 'Trainer cannot see wallet/credit overview'; END IF;
END $$;
RESET ROLE;

SELECT set_config('test.is_trainer','0',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wod_wallets)<>0
    OR (SELECT count(*) FROM public.wod_credit_transactions)<>0
    THEN RAISE EXCEPTION 'Anonymous auth account can see permanent users credits'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'RCF postgres RPC + RLS integration tests passed' AS result;
