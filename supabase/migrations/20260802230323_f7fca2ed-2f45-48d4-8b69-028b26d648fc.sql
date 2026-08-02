ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_kind_check
  CHECK (kind = ANY (ARRAY['text'::text, 'system'::text, 'booking_request'::text]));

DROP POLICY IF EXISTS "Participants can send messages" ON public.chat_messages;
CREATE POLICY "Participants can send messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_chat_participant(thread_id, auth.uid())
  AND (
    kind = 'text'
    OR (
      kind = 'booking_request'
      AND EXISTS (
        SELECT 1 FROM public.chat_threads t
        WHERE t.id = chat_messages.thread_id
          AND t.pro_user_id = auth.uid()
      )
    )
  )
);