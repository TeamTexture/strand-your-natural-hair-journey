-- Duplicate appointments have appeared when a member books a follow-up herself
-- and then also ticks "follow-up needed" while logging the earlier visit: the
-- log screen inserts a second row for the same professional, date and time.
--
-- A UNIQUE INDEX is deliberately NOT used: existing duplicate rows must stay
-- untouched, and creating the index would fail on them. A BEFORE INSERT trigger
-- applies to new rows only, leaving history exactly as it is.
CREATE OR REPLACE FUNCTION public.appointments_prevent_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cancelled appointments never block: re-booking a cancelled slot is valid.
  IF lower(coalesce(NEW.status, '')) = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.user_id = NEW.user_id
      AND a.appointment_date = NEW.appointment_date
      AND coalesce(a.appointment_time::text, '') = coalesce(NEW.appointment_time::text, '')
      AND lower(coalesce(a.professional_name, '')) = lower(coalesce(NEW.professional_name, ''))
      AND lower(coalesce(a.status, '')) <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'duplicate_appointment: an appointment with this professional already exists at that date and time'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_duplicate_trg ON public.appointments;
CREATE TRIGGER appointments_prevent_duplicate_trg
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_prevent_duplicate();