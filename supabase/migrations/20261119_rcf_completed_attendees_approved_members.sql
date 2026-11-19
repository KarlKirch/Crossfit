-- Toimunud CrossFiti kinnitatud kohalolijate nimed, ainult kinnitatud äpiliikmetele.
-- Privaatseid külaliste andmeid saab lugeda ainult kitsalt piiratud SECURITY DEFINER RPC kaudu.
CREATE OR REPLACE FUNCTION public.wod_completed_attendees_secure(p_training_id bigint)
RETURNS TABLE(attendee_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT private.wod_is_active_user())
     OR p_training_id IS NULL OR p_training_id<=0 THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wod_trainings t
    WHERE t.id=p_training_id
      AND t.archived_at IS NULL AND t.status='published'
      AND t.created_by='783362cf-5a1c-4bc7-ac7c-76e011663bb7'::uuid
      AND lower(btrim(t.title))='crossfit'
      AND t.starts_at+make_interval(mins=>greatest(0,t.duration_minutes))<=now()
  ) THEN RETURN; END IF;
  RETURN QUERY
  SELECT final.attendee_name FROM (
    SELECT COALESCE(NULLIF(btrim(p.display_name),''),'Kasutaja')::text AS attendee_name
    FROM public.wod_registrations r
    JOIN public.wod_attendance a ON a.registration_id=r.id AND a.status='present'
    LEFT JOIN public.wod_profiles p ON p.user_id=r.user_id
    WHERE r.training_id=p_training_id AND r.status='confirmed'
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(g.full_name),''),'Külaline')::text
    FROM private.wod_guest_bookings g
    WHERE g.training_id=p_training_id AND g.status='confirmed'
      AND g.attendance_status='present'
  ) final ORDER BY final.attendee_name COLLATE "C";
END
$function$;
REVOKE ALL ON FUNCTION public.wod_completed_attendees_secure(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wod_completed_attendees_secure(bigint) TO authenticated;
