-- 1. Extend the appointments record for pro-side diary logging.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- 2. Pro logs an appointment for a consented client (Strand diary).
CREATE OR REPLACE FUNCTION public.pro_log_appointment(
  _client_user_id uuid,
  _appointment_date date,
  _appointment_time text DEFAULT NULL,
  _service text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _location text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro uuid := auth.uid();
  pp public.pro_profiles%ROWTYPE;
  appt_id uuid;
  v_thread uuid;
  pretty_when text;
BEGIN
  IF v_pro IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _client_user_id IS NULL OR _appointment_date IS NULL THEN
    RAISE EXCEPTION 'Client and date are required';
  END IF;
  IF NOT public.has_active_client_access(v_pro, _client_user_id) THEN
    RAISE EXCEPTION 'You do not have an active client relationship with this member';
  END IF;
  IF NOT (public.has_active_pro_subscription(v_pro) OR public.has_role(v_pro, 'admin')) THEN
    RAISE EXCEPTION 'An active STRAND Pro subscription is required';
  END IF;

  SELECT * INTO pp FROM public.pro_profiles WHERE user_id = v_pro;

  INSERT INTO public.appointments (
    user_id, professional_name, professional_type, clinic_name,
    appointment_date, appointment_time, service, reason, notes, status,
    follow_up_needed, linked_pro_user_id, created_by
  ) VALUES (
    _client_user_id,
    COALESCE(pp.display_name, 'Professional'),
    pp.discipline,
    COALESCE(NULLIF(_location, ''), pp.location),
    _appointment_date,
    NULLIF(_appointment_time, ''),
    NULLIF(_service, ''),
    NULLIF(_service, ''),
    NULLIF(_notes, ''),
    'upcoming',
    false,
    v_pro,
    v_pro
  ) RETURNING id INTO appt_id;

  pretty_when := to_char(_appointment_date, 'Dy DD Mon')
    || CASE WHEN NULLIF(_appointment_time, '') IS NOT NULL THEN ', ' || _appointment_time ELSE '' END;

  SELECT id INTO v_thread
    FROM public.chat_threads
   WHERE pro_user_id = v_pro AND consumer_id = _client_user_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_thread IS NOT NULL THEN
    INSERT INTO public.chat_messages (thread_id, sender_id, kind, body, meta)
    VALUES (
      v_thread, NULL, 'system',
      'Appointment logged — ' || pretty_when
        || CASE WHEN NULLIF(_service, '') IS NOT NULL THEN ' · ' || _service ELSE '' END,
      jsonb_build_object(
        'appointment_id', appt_id,
        'appointment_date', _appointment_date,
        'appointment_time', _appointment_time,
        'service', _service
      )
    );
  END IF;

  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    _client_user_id, 'appointment_logged', v_pro, 'appointment', appt_id,
    '/appointments?appt=' || appt_id::text,
    COALESCE(pp.display_name, 'Your professional') || ' logged an appointment',
    pretty_when || CASE WHEN NULLIF(_service, '') IS NOT NULL THEN ' · ' || _service ELSE '' END
  );

  RETURN appt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pro_log_appointment(uuid, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_log_appointment(uuid, date, text, text, text, text) TO authenticated;

-- 3. Hourly 24h-before reminder for the client.
CREATE OR REPLACE FUNCTION public.queue_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.user_id, a.professional_name, a.appointment_date, a.appointment_time, a.service
    FROM public.appointments a
    WHERE a.reminder_sent_at IS NULL
      AND a.status NOT IN ('completed','cancelled','no_show')
      AND (a.appointment_date::timestamptz + COALESCE(NULLIF(a.appointment_time,'')::time, '09:00'::time))
            BETWEEN now() AND now() + interval '24 hours'
  LOOP
    INSERT INTO public.notifications (user_id, kind, entity_type, entity_id, url, title, body)
    VALUES (
      r.user_id, 'appointment_reminder', 'appointment', r.id,
      '/appointments?appt=' || r.id::text,
      'Appointment tomorrow with ' || COALESCE(r.professional_name, 'your professional'),
      to_char(r.appointment_date, 'Dy DD Mon')
        || CASE WHEN NULLIF(r.appointment_time,'') IS NOT NULL THEN ', ' || r.appointment_time ELSE '' END
        || CASE WHEN NULLIF(r.service,'') IS NOT NULL THEN ' · ' || r.service ELSE '' END
    );
    UPDATE public.appointments SET reminder_sent_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_appointment_reminders() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'strand-appointment-reminders',
  '7 * * * *',
  $$SELECT public.queue_appointment_reminders();$$
);