-- Tühistatud registreeringu taasaktiveerimine ei tohi pärida vana treeneri lisakohta.
CREATE OR REPLACE FUNCTION private.wod_reset_extra_seat_on_reregister()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF old.status='cancelled' AND new.status IN ('confirmed','waitlist') THEN
    new.coach_extra_seat:=false;
  END IF;
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS wod_reset_extra_seat_on_reregister_trg ON public.wod_registrations;
CREATE TRIGGER wod_reset_extra_seat_on_reregister_trg
BEFORE UPDATE OF status ON public.wod_registrations
FOR EACH ROW EXECUTE FUNCTION private.wod_reset_extra_seat_on_reregister();

DROP TRIGGER IF EXISTS wod_guest_reset_extra_seat_on_reregister_trg ON private.wod_guest_bookings;
CREATE TRIGGER wod_guest_reset_extra_seat_on_reregister_trg
BEFORE UPDATE OF status ON private.wod_guest_bookings
FOR EACH ROW EXECUTE FUNCTION private.wod_reset_extra_seat_on_reregister();