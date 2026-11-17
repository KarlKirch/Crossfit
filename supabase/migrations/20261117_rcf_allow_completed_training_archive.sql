-- Toimunud CrossFiti treeningu saab ajaloost eemaldada nii, et maksed
-- ja tegelikult kasutatud krediidid ei muutu. Tulevaste ürituste puhul
-- kehtib jätkuvalt kohustus tühistada ja krediidid tagastada.
CREATE OR REPLACE FUNCTION public.wod_remove_training(p_training_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_training public.wod_trainings%ROWTYPE;
  v_registrations bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT private.wod_is_trainer() THEN
    RAISE EXCEPTION 'Treeninguid saab eemaldada ainult treener.'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_training
  FROM public.wod_trainings
  WHERE id=p_training_id
  FOR UPDATE;

  IF NOT FOUND OR v_training.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Treeningut ei leitud või see on juba eemaldatud.';
  END IF;

  SELECT count(*) INTO v_registrations
  FROM public.wod_registrations
  WHERE training_id=p_training_id;

  IF v_training.starts_at > now()
     AND v_training.status <> 'cancelled'
     AND EXISTS (
       SELECT 1 FROM public.wod_registrations
       WHERE training_id=p_training_id AND credit_charged=true
     ) THEN
    RAISE EXCEPTION 'Enne tulevase treeningu eemaldamist tühista treening. Nii tagastatakse osalejate krediidid.';
  END IF;

  IF v_training.starts_at > now()
     AND v_training.status <> 'cancelled'
     AND v_registrations > 0 THEN
    RAISE EXCEPTION 'Registreeringutega tulevane treening tuleb enne eemaldamist tühistada.';
  END IF;

  IF v_registrations=0 THEN
    DELETE FROM public.wod_trainings WHERE id=p_training_id;
    RETURN 'deleted';
  END IF;

  UPDATE public.wod_trainings
  SET archived_at=now(),updated_at=now()
  WHERE id=p_training_id;
  RETURN 'archived';
END
$function$;
