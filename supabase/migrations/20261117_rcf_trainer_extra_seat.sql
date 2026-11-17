-- Treeneri eraldi kinnitatav lisakoht (ei suurenda treeningu mahutavust).
-- Sama tegevus toimib nii äpi kontoga treenijale kui kodulehe külalisele.

ALTER TABLE public.wod_registrations
  ADD COLUMN IF NOT EXISTS coach_extra_seat boolean NOT NULL DEFAULT false;
ALTER TABLE private.wod_guest_bookings
  ADD COLUMN IF NOT EXISTS coach_extra_seat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wod_registrations.coach_extra_seat IS
  'Treener lubas ootejärjekorra osaleja lisakohale; treeningu capacity ei muutu.';
COMMENT ON COLUMN private.wod_guest_bookings.coach_extra_seat IS
  'Treener lubas kodulehe ootejärjekorra külalise lisakohale; capacity ei muutu.';

CREATE OR REPLACE FUNCTION public.wod_trainer_admit_extra(
  p_training_id bigint,
  p_registration_id bigint,
  p_is_guest boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor uuid := (SELECT auth.uid());
  t public.wod_trainings%rowtype;
  r public.wod_registrations%rowtype;
  g private.wod_guest_bookings%rowtype;
  occupied integer;
BEGIN
  IF actor IS NULL OR coalesce((SELECT (auth.jwt()->>'is_anonymous')::boolean),true)
    OR NOT (SELECT private.wod_is_active_user())
    OR NOT (SELECT private.wod_is_trainer()) THEN
    RAISE EXCEPTION 'Ainult kinnitatud treener võib lisakoha anda';
  END IF;
  IF p_training_id IS NULL OR p_training_id < 1
     OR p_registration_id IS NULL OR p_registration_id < 1 THEN
    RAISE EXCEPTION 'Vigane treeningu või registreeringu tunnus';
  END IF;

  -- Kõik registreerimised ja ootejärjekorrast edutamised lukustavad esmalt treeningu.
  -- Mahutavus jääb muutmata: 9 kinnitatut / 8 kohta tähendab endiselt "täis".
  SELECT * INTO t FROM public.wod_trainings
  WHERE id=p_training_id
    AND created_by='783362cf-5a1c-4bc7-ac7c-76e011663bb7'::uuid
    AND lower(btrim(title))='crossfit'
  FOR UPDATE;
  IF NOT FOUND OR t.status<>'published' OR t.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ainult aktiivse CrossFit treeningu ootejärjekorda saab muuta';
  END IF;

  SELECT (
    (SELECT count(*) FROM public.wod_registrations
       WHERE training_id=t.id AND status='confirmed')
    + (SELECT count(*) FROM private.wod_guest_bookings
       WHERE training_id=t.id AND status='confirmed')
  ) INTO occupied;
  IF occupied<t.capacity THEN
    RAISE EXCEPTION 'Treeningul on veel tavakohti; lisakohta pole vaja';
  END IF;

  IF coalesce(p_is_guest,false) THEN
    SELECT * INTO g FROM private.wod_guest_bookings
      WHERE id=p_registration_id AND training_id=t.id FOR UPDATE;
    IF NOT FOUND OR g.status<>'waitlist' THEN
      RAISE EXCEPTION 'Ootejärjekorras olevat külalist ei leitud';
    END IF;
    UPDATE private.wod_guest_bookings
      SET status='confirmed',coach_extra_seat=true,updated_at=now()
      WHERE id=g.id;
    RETURN true;
  END IF;

  SELECT * INTO r FROM public.wod_registrations
  WHERE id=p_registration_id AND training_id=t.id FOR UPDATE;
  IF NOT FOUND OR r.status<>'waitlist' THEN
    RAISE EXCEPTION 'Ootejärjekorras olevat registreeringut ei leitud';
  END IF;
  IF EXISTS(SELECT 1 FROM public.wod_removed_clients WHERE user_id=r.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.wod_profiles
       WHERE user_id=r.user_id AND approval_status='approved') THEN
    RAISE EXCEPTION 'Kasutaja konto ei ole aktiivne';
  END IF;
  IF r.payment_method='credit' THEN
    -- Sõltumatu tavalisest mahutavusest, sama krediidireegel mis vabanenud kohal.
    -- Kui krediiti pole, viskame vea ja kogu tehing tühistatakse.
    IF NOT private.wod_charge_registration_credit(r.id) THEN
      RAISE EXCEPTION 'Kasutajal pole treeningkrediiti. Lisa krediit või lepi kokku maksmine kohapeal.';
    END IF;
  ELSIF r.payment_method<>'cash' THEN
    RAISE EXCEPTION 'Registreeringu makseviis on vigane';
  END IF;

  UPDATE public.wod_registrations
  SET status='confirmed',coach_extra_seat=true,cancelled_late=false,
      cancelled_at=null,updated_at=now()
  WHERE id=r.id;

  -- Olemasolev trigger paneb ootejärjekorrast edutamise teate järjekorda.
  -- Muudame teksti: ühtegi tavakohta ei vabanenud, treener lubas lisakoha.
  UPDATE public.wod_notifications
    SET title='Treener kinnitas sulle lisakoha',
        body=t.title||' · '||
          to_char(t.starts_at AT TIME ZONE 'Europe/Tallinn','DD.MM.YYYY HH24:MI')||
          '. Treener kinnitas sinu osalemise lisakohal. Oled treeningule registreeritud.'
  WHERE training_id=t.id AND user_id=r.user_id
    AND kind='waitlist_promoted'
    AND tag='crossfit-promotion-'||r.id
    AND sent_at IS NULL;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.wod_trainer_admit_extra(bigint,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_trainer_admit_extra(bigint,bigint,boolean) TO authenticated;

-- Senist külaliste loendit ei muudeta (muud teenused võivad seda kasutada).
-- V3 lisab treenerile lisakoha tunnuse, kuid ei avalda teistele makse/attendance andmeid.
CREATE OR REPLACE FUNCTION public.wod_list_crossfit_guest_bookings_v3()
RETURNS TABLE(
  booking_id bigint,
  training_id bigint,
  full_name text,
  booking_status text,
  payment_status text,
  created_at timestamptz,
  attendance_status text,
  coach_extra_seat boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  trainer boolean;
BEGIN
  IF NOT (SELECT private.wod_is_active_user()) THEN RETURN; END IF;
  trainer := (SELECT private.wod_is_trainer());
  RETURN QUERY
    SELECT g.id,g.training_id,g.full_name,g.status,
      CASE WHEN trainer THEN g.payment_status ELSE NULL::text END,
      g.created_at,
      CASE WHEN trainer THEN g.attendance_status ELSE NULL::text END,
      CASE WHEN trainer THEN g.coach_extra_seat ELSE false END
    FROM private.wod_guest_bookings AS g
    JOIN public.wod_trainings AS t ON t.id=g.training_id
    WHERE t.archived_at IS NULL
      AND t.created_by='783362cf-5a1c-4bc7-ac7c-76e011663bb7'::uuid
      AND lower(btrim(t.title))='crossfit'
      AND t.starts_at>=now()-interval '365 days'
      AND g.status IN ('confirmed','waitlist')
    ORDER BY g.created_at,g.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.wod_list_crossfit_guest_bookings_v3() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_list_crossfit_guest_bookings_v3() TO authenticated;