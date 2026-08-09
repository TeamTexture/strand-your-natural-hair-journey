-- 1. Allow photo and voice messages
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_kind_check
  CHECK (kind = ANY (ARRAY['text'::text, 'system'::text, 'booking_request'::text, 'image'::text, 'voice'::text]));

-- 2. Broadcast records keep the voice note and its transcript
ALTER TABLE public.admin_broadcasts ADD COLUMN IF NOT EXISTS voice_path text;
ALTER TABLE public.admin_broadcasts ADD COLUMN IF NOT EXISTS voice_transcript text;

-- 3. Notifications + email must fire for photos and voice notes too
CREATE OR REPLACE FUNCTION public.notify_chat_recipient()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.chat_threads%ROWTYPE;
  recips uuid[];
  r uuid;
  sender_label text;
BEGIN
  IF NEW.kind NOT IN ('text', 'image', 'voice') OR NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.chat_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF t.thread_type = 'admin_support' THEN
    IF NEW.sender_role = 'admin' OR NEW.sender_id = t.admin_user_id THEN
      recips := ARRAY[t.subject_user_id];
      sender_label := 'STRAND Team';
    ELSE
      recips := ARRAY[t.admin_user_id];
      sender_label := COALESCE((SELECT display_name FROM public.profiles WHERE user_id = NEW.sender_id), 'A member');
    END IF;
  ELSE
    recips := ARRAY[t.pro_user_id, t.consumer_id, t.member_a_id, t.member_b_id];
    sender_label := COALESCE(
      (SELECT display_name FROM public.pro_profiles WHERE user_id = NEW.sender_id AND NEW.sender_role = 'pro'),
      (SELECT display_name FROM public.profiles WHERE user_id = NEW.sender_id),
      'New message'
    );
  END IF;

  FOREACH r IN ARRAY recips LOOP
    IF r IS NOT NULL AND r <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
      VALUES (
        r,
        'chat_message',
        NEW.sender_id,
        'chat_thread',
        NEW.thread_id,
        '/messages/' || NEW.thread_id::text,
        sender_label || CASE NEW.kind
          WHEN 'voice' THEN ' sent you a voice note'
          WHEN 'image' THEN ' sent you a photo'
          ELSE ' sent you a message' END,
        left(COALESCE(NEW.body, ''), 140)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_message_recipient_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.kind in ('text', 'image', 'voice') and new.sender_id is not null then
    begin
      perform extensions.http_post(
        url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-message-recipient',
        body := jsonb_build_object('message_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    exception when others then
      raise warning 'notify_message_recipient_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

-- 4. Recipients of a broadcast voice note can read the audio object
DROP POLICY IF EXISTS chat_images_read_broadcast_recipients ON storage.objects;
CREATE POLICY chat_images_read_broadcast_recipients
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1
      FROM public.chat_messages m
      JOIN public.chat_threads t ON t.id = m.thread_id
     WHERE (m.meta->>'image_path' = objects.name OR m.meta->>'audio_path' = objects.name)
       AND (t.admin_user_id = auth.uid() OR t.subject_user_id = auth.uid()
            OR t.consumer_id = auth.uid() OR t.pro_user_id = auth.uid())
  )
);

-- 5. One broadcast entry point: text, photo and/or voice note
DROP FUNCTION IF EXISTS public.admin_broadcast_message(text, text);
DROP FUNCTION IF EXISTS public.admin_broadcast_message(text, text, text);
CREATE OR REPLACE FUNCTION public.admin_broadcast_message(
  _audience text,
  _body text,
  _image_path text DEFAULT NULL,
  _voice_path text DEFAULT NULL,
  _voice_transcript text DEFAULT NULL,
  _voice_duration_ms integer DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_audience text := lower(trim(coalesce(_audience, '')));
  v_body text := trim(coalesce(_body, ''));
  v_image text := nullif(trim(coalesce(_image_path, '')), '');
  v_voice text := nullif(trim(coalesce(_voice_path, '')), '');
  v_transcript text := nullif(trim(coalesce(_voice_transcript, '')), '');
  v_kind text;
  v_text text;
  v_recipient record;
  v_thread uuid;
  v_role text;
  v_count integer := 0;
  v_broadcast uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Only admins can broadcast';
  END IF;
  IF v_audience NOT IN ('all', 'consumer', 'professional', 'brand') THEN
    RAISE EXCEPTION 'Invalid audience';
  END IF;
  -- A photo or a voice note on its own is a valid message; text alone still is.
  IF v_body = '' AND v_image IS NULL AND v_voice IS NULL THEN
    RAISE EXCEPTION 'Message required';
  END IF;

  -- One broadcast is one message per recipient, so a voice note wins the kind
  -- and any text becomes its caption.
  v_kind := CASE WHEN v_voice IS NOT NULL THEN 'voice'
                 WHEN v_image IS NOT NULL THEN 'image'
                 ELSE 'text' END;
  v_text := CASE
    WHEN v_body <> '' THEN v_body
    WHEN v_kind = 'voice' THEN COALESCE(v_transcript, 'Voice note')
    WHEN v_kind = 'image' THEN 'Photo'
    ELSE v_body END;

  INSERT INTO public.admin_broadcasts (admin_user_id, audience, body, image_path, voice_path, voice_transcript)
    VALUES (v_admin, v_audience, v_text, v_image, v_voice, v_transcript)
    RETURNING id INTO v_broadcast;

  FOR v_recipient IN
    SELECT ur.user_id,
           CASE
             WHEN v_audience = 'all' THEN
               CASE
                 WHEN bool_or(ur.role = 'brand') THEN 'brand'
                 WHEN bool_or(ur.role = 'professional') THEN 'pro'
                 ELSE 'consumer'
               END
             WHEN v_audience = 'professional' THEN 'pro'
             WHEN v_audience = 'brand' THEN 'brand'
             ELSE 'consumer'
           END AS subject_role
      FROM public.user_roles ur
     WHERE ur.user_id <> v_admin
       AND NOT public.is_access_restricted(ur.user_id)
       AND (
         v_audience = 'all'
         OR (v_audience = 'consumer' AND ur.role = 'consumer')
         OR (v_audience = 'professional' AND ur.role = 'professional')
         OR (v_audience = 'brand' AND ur.role = 'brand')
       )
     GROUP BY ur.user_id
  LOOP
    v_role := v_recipient.subject_role;

    SELECT id INTO v_thread
      FROM public.chat_threads
     WHERE thread_type = 'admin_support'
       AND admin_user_id = v_admin
       AND subject_user_id = v_recipient.user_id
       AND COALESCE(subject_role, 'consumer') = v_role
     LIMIT 1;

    IF v_thread IS NULL THEN
      INSERT INTO public.chat_threads (thread_type, admin_user_id, subject_user_id, subject_role)
        VALUES ('admin_support', v_admin, v_recipient.user_id, v_role)
        RETURNING id INTO v_thread;

      INSERT INTO public.chat_messages (thread_id, sender_id, kind, body)
        VALUES (v_thread, NULL, 'system', 'Chat opened by STRAND Team.');
    END IF;

    INSERT INTO public.chat_messages (thread_id, sender_id, sender_role, kind, body, meta)
      VALUES (v_thread, v_admin, 'admin', v_kind, v_text,
              jsonb_strip_nulls(jsonb_build_object(
                'broadcast_id', v_broadcast,
                'audience', v_audience,
                'image_path', v_image,
                'audio_path', v_voice,
                'transcript', v_transcript,
                'duration_ms', _voice_duration_ms
              )));

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.admin_broadcasts SET recipient_count = v_count WHERE id = v_broadcast;

  RETURN jsonb_build_object('broadcast_id', v_broadcast, 'audience', v_audience, 'recipients', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_broadcast_message(text, text, text, text, text, integer) TO authenticated;