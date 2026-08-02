CREATE OR REPLACE FUNCTION public.note_booking_link_opened(_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.chat_threads%ROWTYPE;
  v_me uuid := auth.uid();
  v_name text;
  v_recent boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO t FROM public.chat_threads WHERE id = _thread_id;
  IF NOT FOUND OR t.consumer_id IS DISTINCT FROM v_me OR t.pro_user_id IS NULL THEN
    RAISE EXCEPTION 'Not your booking thread';
  END IF;

  -- Debounce: at most one note per thread per hour.
  SELECT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE thread_id = _thread_id
      AND meta->>'booking_opened' = 'true'
      AND created_at > now() - interval '1 hour'
  ) INTO v_recent;
  IF v_recent THEN
    RETURN;
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE user_id = v_me;

  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body, meta)
  VALUES (
    _thread_id, NULL, 'system',
    COALESCE(NULLIF(split_part(COALESCE(v_name, ''), ' ', 1), ''), 'Your client')
      || ' opened your booking page.',
    jsonb_build_object('booking_opened', true)
  );

  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    t.pro_user_id, 'booking_link_opened', v_me, 'chat_thread', _thread_id,
    '/messages/' || _thread_id::text,
    'A client opened your booking page',
    'If they booked, log it in your Strand diary so it appears in both diaries.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.note_booking_link_opened(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_booking_link_opened(uuid) TO authenticated;