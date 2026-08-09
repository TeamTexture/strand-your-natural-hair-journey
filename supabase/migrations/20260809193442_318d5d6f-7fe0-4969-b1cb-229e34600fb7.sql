-- Broadcast images live under a random uuid folder that is not a chat thread,
-- so the participant policies can't authorise them. Two extra policies:
-- admins may upload, and anyone holding a chat message that references the
-- exact object may read it.
CREATE POLICY chat_images_insert_admin_broadcast
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND owner = auth.uid()
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY chat_images_read_broadcast_recipients
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1
      FROM public.chat_messages m
      JOIN public.chat_threads t ON t.id = m.thread_id
     WHERE m.meta->>'image_path' = storage.objects.name
       AND (t.admin_user_id = auth.uid() OR t.subject_user_id = auth.uid()
            OR t.consumer_id = auth.uid() OR t.pro_user_id = auth.uid())
  )
);

-- Optional image on a broadcast: stored path is copied into every recipient's
-- message row, so each recipient's own thread carries the photo.
ALTER TABLE public.admin_broadcasts ADD COLUMN IF NOT EXISTS image_path text;

CREATE OR REPLACE FUNCTION public.admin_broadcast_message(_audience text, _body text, _image_path text DEFAULT NULL)
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
  -- A photo on its own is a valid message; text alone still is too.
  IF v_body = '' AND v_image IS NULL THEN
    RAISE EXCEPTION 'Message required';
  END IF;

  INSERT INTO public.admin_broadcasts (admin_user_id, audience, body, image_path)
    VALUES (v_admin, v_audience, v_body, v_image)
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
      VALUES (v_thread, v_admin, 'admin',
              CASE WHEN v_image IS NULL THEN 'text' ELSE 'image' END,
              CASE WHEN v_body = '' THEN 'Photo' ELSE v_body END,
              jsonb_strip_nulls(jsonb_build_object(
                'broadcast_id', v_broadcast,
                'audience', v_audience,
                'image_path', v_image
              )));

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.admin_broadcasts SET recipient_count = v_count WHERE id = v_broadcast;

  RETURN jsonb_build_object('broadcast_id', v_broadcast, 'audience', v_audience, 'recipients', v_count);
END;
$function$;