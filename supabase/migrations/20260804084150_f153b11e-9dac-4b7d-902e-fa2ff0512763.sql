-- 1. Extend the EXISTING appointments table. No parallel table is created.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS location_format text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_location_format_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_location_format_check
  CHECK (location_format IS NULL OR location_format IN ('in_person', 'virtual'));

-- 2. The member's log belongs to the member. A linked professional keeps their
-- existing diary abilities (visit outcome, follow-up, status) but can never
-- rewrite what the client entered.
CREATE OR REPLACE FUNCTION public.appointments_lock_client_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id OR has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Anyone else (i.e. the linked professional) gets the client's own fields
  -- forced back to their stored values.
  NEW.user_id            := OLD.user_id;
  NEW.appointment_date   := OLD.appointment_date;
  NEW.appointment_time   := OLD.appointment_time;
  NEW.service            := OLD.service;
  NEW.reason             := OLD.reason;
  NEW.notes              := OLD.notes;
  NEW.location_format    := OLD.location_format;
  NEW.professional_name  := OLD.professional_name;
  NEW.professional_type  := OLD.professional_type;
  NEW.clinic_name        := OLD.clinic_name;
  NEW.linked_pro_user_id := OLD.linked_pro_user_id;
  NEW.created_by         := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_lock_client_columns ON public.appointments;
CREATE TRIGGER trg_appointments_lock_client_columns
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_lock_client_columns();

-- 3. Mark a pending click as prompted. Written only once the prompt is on
-- screen, and idempotent so a remount cannot double-count.
CREATE OR REPLACE FUNCTION public.mark_booking_click_prompted(_click_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pro_booking_clicks
     SET prompted_at = COALESCE(prompted_at, now())
   WHERE id = _click_id
     AND user_id = auth.uid();
END;
$$;

-- 4. Resolve a click, collapsing older pending clicks for the SAME
-- professional into the same outcome: two departures before returning is one
-- booking attempt, not two prompts.
CREATE OR REPLACE FUNCTION public.resolve_booking_click(
  _click_id uuid,
  _outcome text,
  _appointment_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro uuid;
  v_clicked_at timestamptz;
BEGIN
  IF _outcome NOT IN ('booked', 'not_booked', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid outcome %', _outcome;
  END IF;

  SELECT professional_id, clicked_at INTO v_pro, v_clicked_at
    FROM public.pro_booking_clicks
   WHERE id = _click_id AND user_id = auth.uid();
  IF v_pro IS NULL THEN
    RAISE EXCEPTION 'Booking click not found';
  END IF;

  IF _appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments
     WHERE id = _appointment_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  UPDATE public.pro_booking_clicks
     SET outcome = _outcome,
         appointment_id = COALESCE(_appointment_id, appointment_id),
         prompted_at = COALESCE(prompted_at, now())
   WHERE id = _click_id
     AND user_id = auth.uid();

  -- Older unanswered departures to the same professional inherit the answer,
  -- but never the appointment link (one log, one record).
  UPDATE public.pro_booking_clicks
     SET outcome = _outcome,
         prompted_at = COALESCE(prompted_at, now())
   WHERE user_id = auth.uid()
     AND professional_id = v_pro
     AND outcome IS NULL
     AND clicked_at <= v_clicked_at
     AND id <> _click_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_booking_click_prompted(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_booking_click(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_booking_click_prompted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_booking_click(uuid, text, uuid) TO authenticated;