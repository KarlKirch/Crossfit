-- Rõuge CrossFit: tegeliku kohaloleku arvestus (eraldi broneeringutest).
-- Ajaloolisi broneeringuid ei muudeta automaatselt osalemisteks.
CREATE TABLE IF NOT EXISTS public.wod_attendance (
  registration_id bigint PRIMARY KEY REFERENCES public.wod_registrations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present','absent')),
  marked_by uuid NOT NULL REFERENCES auth.users(id),
  marked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wod_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wod_attendance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.wod_attendance TO authenticated;

DROP POLICY IF EXISTS wod_attendance_read_self_or_trainer ON public.wod_attendance;
CREATE POLICY wod_attendance_read_self_or_trainer ON public.wod_attendance
FOR SELECT TO authenticated USING (
  (SELECT private.wod_is_active_user())
  AND EXISTS (
    SELECT 1 FROM public.wod_registrations r
    WHERE r.id=registration_id
      AND (r.user_id=(SELECT auth.uid()) OR (SELECT private.wod_is_trainer()))
  )
);

CREATE OR REPLACE FUNCTION public.wod_mark_attendance(
  p_registration_id bigint, p_status text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  r public.wod_registrations%rowtype;
  t public.wod_trainings%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR COALESCE((SELECT (auth.jwt()->>'is_anonymous')::boolean),true)
    OR NOT (SELECT private.wod_is_active_user())
    OR NOT (SELECT private.wod_is_trainer()) THEN
    RAISE EXCEPTION 'Kohalolekut saab märkida ainult kinnitatud treener';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('present','absent','unmarked') THEN
    RAISE EXCEPTION 'Tundmatu kohaloleku olek';
  END IF;
  SELECT * INTO r FROM public.wod_registrations
  WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registreeringut ei leitud'; END IF;
  SELECT * INTO t FROM public.wod_trainings
  WHERE id=r.training_id;
  IF NOT FOUND OR t.status<>'published' OR t.archived_at IS NOT NULL
    OR r.status<>'confirmed' THEN
    RAISE EXCEPTION 'Kohalolekut saab märkida vaid kehtivale registreeringule';
  END IF;
  IF t.starts_at + make_interval(mins=>t.duration_minutes)>now() THEN
    RAISE EXCEPTION 'Kohalolekut saab märkida pärast treeningu lõppu';
  END IF;

  IF p_status='unmarked' THEN
    DELETE FROM public.wod_attendance WHERE registration_id=r.id;
  ELSE
    INSERT INTO public.wod_attendance(registration_id,status,marked_by,marked_at)
    VALUES (r.id,p_status,(SELECT auth.uid()),now())
    ON CONFLICT (registration_id) DO UPDATE SET
      status=excluded.status,
      marked_by=excluded.marked_by,
      marked_at=excluded.marked_at;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.wod_mark_attendance(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_mark_attendance(bigint,text) TO authenticated;

-- Kõik varasemad kinnitatud/kohaloluks märgitud treeningud, mitte ainult
-- mobiili laaditud viimase 365 päeva treeningud. Ajavöönd Europe/Tallinn.
CREATE OR REPLACE FUNCTION public.wod_attendance_summary(
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  uid uuid := COALESCE(p_user_id,(SELECT auth.uid()));
  result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR COALESCE((SELECT (auth.jwt()->>'is_anonymous')::boolean),true)
    OR NOT (SELECT private.wod_is_active_user()) THEN
    RAISE EXCEPTION 'Aktiivne CrossFiti konto on vajalik';
  END IF;
  IF uid IS DISTINCT FROM (SELECT auth.uid())
    AND NOT (SELECT private.wod_is_trainer()) THEN
    RAISE EXCEPTION 'Teise kliendi statistikat ei tohi vaadata';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wod_profiles p
    WHERE p.user_id=uid AND p.approval_status='approved'
  ) THEN
    RAISE EXCEPTION 'CrossFiti kasutajat ei leitud';
  END IF;

  WITH records AS (
    SELECT a.status,t.starts_at,
           (t.starts_at AT TIME ZONE 'Europe/Tallinn') AS local_started
    FROM public.wod_attendance a
    JOIN public.wod_registrations r ON r.id=a.registration_id
    JOIN public.wod_trainings t ON t.id=r.training_id
    WHERE r.user_id=uid AND r.status='confirmed'
      AND t.status='published' AND t.archived_at IS NULL
      AND t.starts_at + make_interval(mins=>t.duration_minutes)<=now()
  ),
  weekly AS (
    SELECT (date_trunc('week',now() AT TIME ZONE 'Europe/Tallinn')
              - g.i*interval '7 days')::date AS week_start,
           COALESCE((SELECT count(*) FROM records d
             WHERE d.status='present'
               AND date_trunc('week',d.local_started)::date =
                 (date_trunc('week',now() AT TIME ZONE 'Europe/Tallinn')
                 - g.i*interval '7 days')::date),0)::integer AS count
    FROM generate_series(0,51) g(i)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM records WHERE status='present'),
    'month', (SELECT count(*) FROM records WHERE status='present'
      AND date_trunc('month',local_started)
        = date_trunc('month',now() AT TIME ZONE 'Europe/Tallinn')),
    'absent', (SELECT count(*) FROM records WHERE status='absent'),
    'marked', (SELECT count(*) FROM records),
    'last_attended', (SELECT max(starts_at) FROM records WHERE status='present'),
    'weeks', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('week_start',week_start,'count',count)
      ORDER BY week_start),'[]'::jsonb) FROM weekly)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.wod_attendance_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_attendance_summary(uuid) TO authenticated;
