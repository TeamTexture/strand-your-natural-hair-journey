ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public.pro_cancel_appointment(_appointment_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments;
  v_pro_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id;
  IF v_appt.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appt.linked_pro_user_id IS DISTINCT FROM auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not your appointment';
  END IF;

  UPDATE public.appointments
     SET status = 'cancelled',
         cancellation_reason = btrim(_reason),
         cancelled_by = auth.uid(),
         cancelled_at = now()
   WHERE id = _appointment_id;

  SELECT COALESCE(display_name, v_appt.professional_name)
    INTO v_pro_name
    FROM public.pro_profiles
   WHERE user_id = auth.uid();

  INSERT INTO public.notifications (user_id, actor_id, kind, title, body, entity_type, entity_id, url)
  VALUES (
    v_appt.user_id,
    auth.uid(),
    'appointment_cancelled',
    'Appointment cancelled',
    COALESCE(v_pro_name, v_appt.professional_name) || ' cancelled your appointment on '
      || to_char(v_appt.appointment_date, 'DD Mon YYYY') || '. Reason: ' || btrim(_reason),
    'appointment',
    _appointment_id,
    '/appointments?appt=' || _appointment_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pro_cancel_appointment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_cancel_appointment(uuid, text) TO authenticated;