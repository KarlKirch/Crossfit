-- RÕUGE CROSSFIT — TURVAETTEPANEK (MITTE AUTOMAATSELT KÄIVITATAV)
-- Audit 2026-10-22. Kontrollitud ainult lugemispäringutega.
--
-- OHUTUS: ÄRA KÄIVITA OTSE TOOTMISKESKKONNAS.
-- Rakenda esmalt eraldatud, anonümiseeritud testandmetega Supabase'i harus.
-- Tähtis: praegune projekt sisaldab KA FUTBOLI andmeid. Ära muuda teiste
-- rakenduste tabeleid ega funktsioone. Tee enne kontrollitud varukoopia.
--
-- Probleem: permissive FOR ALL poliitikad nimega wod_active_account_only ja
-- wod_*_permanent_only toimivad koos kitsamate poliitikatega OR-loogika kaudu.
-- Seega võib aktiivne sisse loginud kasutaja saada teiste ridadele ligipääsu
-- ning olemasoleva GRANT-i korral otse sisestada/muuta/kustutada andmeid.
--
-- Lahendus: EEMALDA liiga laiad permissive ALL poliitikad ja asenda need
-- RESTRICTIVE FOR ALL ligipääsuväravaga; kitsamad olemasolevad lubavad poliitikad
-- jäävad alles. PostgreSQL nõuab jätkuvalt vähemalt üht sobivat PERMISSIVE
-- poliitikat. Seega kasutajad ei saa tabelitesse niisama kirjutada.
--
-- Enne rakendamist kontrolli täpselt:
-- 1. Kas vead on testkeskkonnas reprodutseeritud?
-- 2. Kas krediiidi lisamise/tühistamise RPC-d ja WOD/treeneri muudatused töötavad?
-- 3. Kas kliendiprofiili loomine läbi wod_ensure_profile töötab?
-- 4. Kas push-teavituse tellimus on endiselt kasutaja enda kirje piirides?
-- 5. Kas varukoopia JA taastamise katse õnnestus?
--
-- Rollide privileegide võimaliku hilisema tugevdamise jaoks kasuta
-- eraldi GRANT/REVOKE migratsiooni; ära eemalda treenerilt WOD CRUD õigust
-- ega push-tellimuse enda-kirje muutmise õigust.

BEGIN;

DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'wod_credit_transactions',
    'wod_notifications',
    'wod_package_types',
    'wod_payments',
    'wod_profiles',
    'wod_push_subscriptions',
    'wod_registrations',
    'wod_trainings',
    'wod_user_packages',
    'wod_wallets'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    -- Sulge varem kasutatud permissive ALL väravad. Need ei piira
    -- teiste poliitikate lubasid, vaid laiendavad neid.
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'wod_active_account_only', table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      table_name || '_permanent_only', table_name
    );

    -- RESTRICTIVE värav rakendub korraga kõigile tabeli õigustele.
    EXECUTE format(
      'DROP POLICY IF EXISTS wod_active_verified_gate ON public.%I',
      table_name
    );
    EXECUTE format(
      $stmt$
      CREATE POLICY wod_active_verified_gate ON public.%I
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        (SELECT private.wod_is_active_user())
        AND COALESCE((SELECT (auth.jwt()->>'is_anonymous')::boolean),true)=false
      )
      WITH CHECK (
        (SELECT private.wod_is_active_user())
        AND COALESCE((SELECT (auth.jwt()->>'is_anonymous')::boolean),true)=false
      )
      $stmt$,
      table_name
    );
  END LOOP;
END $$;

-- Kontrolli enne COMMIT-it: kõigil tabelitel peab olema 1 RESTRICTIVE värav
-- ja 0 vana permissive ALL poliitikat.
DO $$
DECLARE
  vulnerable_count integer;
  gate_count integer;
BEGIN
  SELECT count(*) INTO vulnerable_count
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'wod_credit_transactions','wod_notifications','wod_package_types',
      'wod_payments','wod_profiles','wod_push_subscriptions',
      'wod_registrations','wod_trainings','wod_user_packages','wod_wallets'
    )
    AND permissive='PERMISSIVE' AND cmd='ALL';
  IF vulnerable_count<>0 THEN
    RAISE EXCEPTION 'Turvaparandus ei eemalda kõiki permissive ALL poliitikaid: %',vulnerable_count;
  END IF;

  SELECT count(*) INTO gate_count
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'wod_credit_transactions','wod_notifications','wod_package_types',
      'wod_payments','wod_profiles','wod_push_subscriptions',
      'wod_registrations','wod_trainings','wod_user_packages','wod_wallets'
    )
    AND policyname='wod_active_verified_gate'
    AND permissive='RESTRICTIVE' AND cmd='ALL';
  IF gate_count<>10 THEN
    RAISE EXCEPTION 'Piiravaid väravaid on %, oodati 10',gate_count;
  END IF;
END $$;

COMMIT;

-- Pärast testkeskkonna rakendamist:
-- Testi kliendina teiste kontode saldode ja profiilide nägemist/muutmist,
-- treenerina WOD ja treeningute sisestamist ning tühistamisel krediiditagastust.
-- Alles pärast edukat kasutajatestimist kaaluda tootmiskeskkonna migratsiooni.
