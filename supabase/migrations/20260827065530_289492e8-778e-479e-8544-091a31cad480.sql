-- Member-initiated support thread: one admin_support thread per member.
CREATE OR REPLACE FUNCTION public.member_start_support_thread()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_admin uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT id INTO v_id
    FROM public.chat_threads
   WHERE thread_type = 'admin_support'
     AND subject_user_id = v_uid
   ORDER BY created_at
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT ur.user_id INTO v_admin
    FROM public.user_roles ur
   WHERE ur.role = 'admin'
   ORDER BY ur.created_at
   LIMIT 1;

  INSERT INTO public.chat_threads (thread_type, admin_user_id, subject_user_id, subject_role)
    VALUES ('admin_support', v_admin, v_uid, 'consumer')
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.member_start_support_thread() TO authenticated;

-- Any STRAND admin can read and reply across every support thread.
CREATE POLICY "Admins can view support threads"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (thread_type = 'admin_support' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view support messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
       WHERE t.id = chat_messages.thread_id AND t.thread_type = 'admin_support'
    )
  );

CREATE POLICY "Admins can send support messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND kind = ANY (ARRAY['text'::text, 'image'::text, 'voice'::text])
    AND public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
       WHERE t.id = chat_messages.thread_id AND t.thread_type = 'admin_support'
    )
  );

CREATE POLICY "Admins can mark support messages read"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
       WHERE t.id = chat_messages.thread_id AND t.thread_type = 'admin_support'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.chat_threads t
       WHERE t.id = chat_messages.thread_id AND t.thread_type = 'admin_support'
    )
  );