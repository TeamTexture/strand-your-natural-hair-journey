
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS subject_role text;

UPDATE public.chat_threads t
  SET subject_role = CASE
    WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id = t.subject_user_id AND r.role = 'brand') THEN 'brand'
    WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id = t.subject_user_id AND r.role = 'professional') THEN 'pro'
    ELSE 'consumer'
  END
  WHERE t.thread_type = 'admin_support' AND t.subject_role IS NULL;

CREATE OR REPLACE FUNCTION public.admin_start_support_thread(_subject_user uuid, _subject_role text DEFAULT 'consumer')
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_id uuid;
  v_role text := COALESCE(NULLIF(lower(trim(_subject_role)), ''), 'consumer');
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Only admins can start support threads';
  END IF;
  IF _subject_user IS NULL OR _subject_user = v_admin THEN
    RAISE EXCEPTION 'Subject user required';
  END IF;
  IF v_role NOT IN ('consumer','pro','brand') THEN
    RAISE EXCEPTION 'Invalid subject role';
  END IF;

  SELECT id INTO v_id
    FROM public.chat_threads
   WHERE thread_type = 'admin_support'
     AND admin_user_id = v_admin
     AND subject_user_id = _subject_user
     AND COALESCE(subject_role, 'consumer') = v_role
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.chat_threads (thread_type, admin_user_id, subject_user_id, subject_role)
    VALUES ('admin_support', v_admin, _subject_user, v_role)
    RETURNING id INTO v_id;

  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body)
    VALUES (v_id, NULL, 'system', 'Chat opened by STRAND Team.');

  RETURN v_id;
END;
$function$;
