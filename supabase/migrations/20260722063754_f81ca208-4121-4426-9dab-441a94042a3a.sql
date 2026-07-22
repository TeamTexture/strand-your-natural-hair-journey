
-- =========================================================
-- Chat threads
-- =========================================================
CREATE TABLE public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL UNIQUE REFERENCES public.pro_enquiries(id) ON DELETE CASCADE,
  pro_user_id uuid NOT NULL,
  consumer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);
CREATE INDEX chat_threads_pro_idx ON public.chat_threads(pro_user_id, last_message_at DESC NULLS LAST);
CREATE INDEX chat_threads_consumer_idx ON public.chat_threads(consumer_id, last_message_at DESC NULLS LAST);

GRANT SELECT, INSERT, UPDATE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their threads"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (auth.uid() = pro_user_id OR auth.uid() = consumer_id);

CREATE POLICY "Admins can view all threads (metadata only)"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Chat messages
-- =========================================================
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id uuid,                                     -- NULL for system messages
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','system')),
  body text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX chat_messages_thread_idx ON public.chat_messages(thread_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND (auth.uid() = t.pro_user_id OR auth.uid() = t.consumer_id)
  ));

CREATE POLICY "Participants can send messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'text'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND (auth.uid() = t.pro_user_id OR auth.uid() = t.consumer_id)
    )
  );

CREATE POLICY "Participants can mark their incoming messages read"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND (auth.uid() = t.pro_user_id OR auth.uid() = t.consumer_id)
      AND sender_id IS DISTINCT FROM auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND (auth.uid() = t.pro_user_id OR auth.uid() = t.consumer_id)
  ));

-- =========================================================
-- Bump thread's last_message_at on new message
-- =========================================================
CREATE OR REPLACE FUNCTION public.chat_bump_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_threads
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_bump_thread
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_bump_thread();

-- =========================================================
-- Open thread on enquiry acceptance
-- =========================================================
CREATE OR REPLACE FUNCTION public.accept_enquiry(_enquiry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enq public.pro_enquiries%ROWTYPE;
  access_id uuid;
  new_thread_id uuid;
BEGIN
  SELECT * INTO enq FROM public.pro_enquiries WHERE id = _enquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry not found';
  END IF;
  IF enq.pro_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the addressed professional can accept this enquiry';
  END IF;
  IF NOT public.has_active_pro_subscription(auth.uid()) THEN
    RAISE EXCEPTION 'An active STRAND Pro subscription is required to accept enquiries';
  END IF;
  IF enq.status <> 'pending' THEN
    RAISE EXCEPTION 'Enquiry is no longer pending';
  END IF;
  IF enq.share_passport_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Enquiry lacks passport consent';
  END IF;

  UPDATE public.pro_enquiries
    SET status = 'accepted', responded_at = now()
    WHERE id = _enquiry_id;

  INSERT INTO public.pro_client_access (pro_user_id, consumer_id, enquiry_id)
    VALUES (enq.pro_user_id, enq.consumer_id, enq.id)
    ON CONFLICT (pro_user_id, consumer_id) WHERE revoked_at IS NULL
    DO UPDATE SET enquiry_id = EXCLUDED.enquiry_id
    RETURNING id INTO access_id;

  -- Open a chat thread if not already there
  INSERT INTO public.chat_threads (enquiry_id, pro_user_id, consumer_id)
    VALUES (enq.id, enq.pro_user_id, enq.consumer_id)
    ON CONFLICT (enquiry_id) DO UPDATE SET pro_user_id = EXCLUDED.pro_user_id
    RETURNING id INTO new_thread_id;

  -- Seed with a system welcome message
  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body)
    VALUES (
      new_thread_id,
      NULL,
      'system',
      'Enquiry accepted — you can now message directly.'
    );

  RETURN access_id;
END;
$$;

-- =========================================================
-- Book an appointment from inside a chat thread
-- =========================================================
CREATE OR REPLACE FUNCTION public.chat_book_appointment(
  _thread_id uuid,
  _appointment_date date,
  _appointment_time text,
  _location text,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.chat_threads%ROWTYPE;
  pp public.pro_profiles%ROWTYPE;
  appt_id uuid;
  pretty_when text;
BEGIN
  SELECT * INTO t FROM public.chat_threads WHERE id = _thread_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;
  IF t.pro_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the professional can book appointments in this thread';
  END IF;
  IF _appointment_date IS NULL THEN
    RAISE EXCEPTION 'Appointment date required';
  END IF;

  SELECT * INTO pp FROM public.pro_profiles WHERE user_id = t.pro_user_id;

  INSERT INTO public.appointments (
    user_id, professional_name, professional_type, clinic_name,
    appointment_date, appointment_time, reason, notes, status,
    follow_up_needed, linked_pro_user_id
  ) VALUES (
    t.consumer_id,
    COALESCE(pp.display_name, 'Professional'),
    COALESCE(pp.discipline, NULL),
    COALESCE(NULLIF(_location,''), pp.location),
    _appointment_date,
    NULLIF(_appointment_time,''),
    NULL,
    NULLIF(_notes,''),
    'upcoming',
    false,
    t.pro_user_id
  ) RETURNING id INTO appt_id;

  pretty_when := to_char(_appointment_date, 'Dy DD Mon')
    || CASE WHEN NULLIF(_appointment_time,'') IS NOT NULL
         THEN ', ' || _appointment_time ELSE '' END;

  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body, meta)
    VALUES (
      _thread_id,
      NULL,
      'system',
      'Appointment booked — ' || pretty_when,
      jsonb_build_object(
        'appointment_id', appt_id,
        'appointment_date', _appointment_date,
        'appointment_time', _appointment_time,
        'location', _location,
        'notes', _notes
      )
    );

  RETURN appt_id;
END;
$$;

-- =========================================================
-- Backfill threads for previously accepted enquiries
-- =========================================================
INSERT INTO public.chat_threads (enquiry_id, pro_user_id, consumer_id)
SELECT e.id, e.pro_user_id, e.consumer_id
FROM public.pro_enquiries e
LEFT JOIN public.chat_threads t ON t.enquiry_id = e.id
WHERE e.status = 'accepted' AND t.id IS NULL;

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
