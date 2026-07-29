-- Allow chat participants to mark ANY message in their thread as read,
-- including their own messages when a multi-role account sits on both
-- sides of the thread. Only read_at may change on update.

CREATE OR REPLACE FUNCTION public.chat_messages_read_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.meta IS DISTINCT FROM OLD.meta
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read_at may be updated on chat messages';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_read_only_update ON public.chat_messages;
CREATE TRIGGER chat_messages_read_only_update
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_read_only_update();

DROP POLICY IF EXISTS "Participants can mark their incoming messages read" ON public.chat_messages;
CREATE POLICY "Participants can mark messages read"
  ON public.chat_messages FOR UPDATE
  TO authenticated
  USING (public.is_chat_participant(thread_id, auth.uid()))
  WITH CHECK (public.is_chat_participant(thread_id, auth.uid()));