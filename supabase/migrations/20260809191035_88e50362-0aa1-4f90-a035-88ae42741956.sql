-- Broadcast log so admins can see what was sent, to whom, and how many landed.
CREATE TABLE IF NOT EXISTS public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  audience text NOT NULL,
  body text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_broadcasts TO authenticated;
GRANT ALL ON public.admin_broadcasts TO service_role;

ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read broadcasts" ON public.admin_broadcasts;
CREATE POLICY "Admins read broadcasts"
  ON public.admin_broadcasts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Send one message to an audience. Reuses each recipient's existing
-- STRAND Team thread so replies stay private one-to-one, and inserts a normal
-- chat message per recipient, which the existing insert trigger emails.
CREATE OR REPLACE FUNCTION public.admin_broadcast_message(_audience text, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_audience text := lower(trim(coalesce(_audience, '')));
  v_body text := trim(coalesce(_body, ''));
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
  IF v_body = '' THEN
    RAISE EXCEPTION 'Message required';
  END IF;

  INSERT INTO public.admin_broadcasts (admin_user_id, audience, body)
    VALUES (v_admin, v_audience, v_body)
    RETURNING id INTO v_broadcast;

  FOR v_recipient IN
    -- One row per recipient. A dual-role account is messaged once, in the
    -- thread matching the audience (or its highest-priority role for "all").
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
      VALUES (v_thread, v_admin, 'admin', 'text', v_body,
              jsonb_build_object('broadcast_id', v_broadcast, 'audience', v_audience));

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.admin_broadcasts SET recipient_count = v_count WHERE id = v_broadcast;

  RETURN jsonb_build_object('broadcast_id', v_broadcast, 'audience', v_audience, 'recipients', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_broadcast_message(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_message(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_message(text, text) TO service_role;