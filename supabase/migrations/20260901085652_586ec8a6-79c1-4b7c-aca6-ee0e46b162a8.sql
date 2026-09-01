CREATE OR REPLACE FUNCTION public.can_view_chat_message(_message_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    JOIN public.chat_threads t ON t.id = m.thread_id
    WHERE m.id = _message_id
      AND _user_id IS NOT NULL
      AND (
        public.is_chat_participant(m.thread_id, _user_id)
        OR (t.thread_type = 'admin_support' AND public.has_role(_user_id, 'admin'::app_role))
      )
  );
$$;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '❤️',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions (message_id);

GRANT SELECT, INSERT, DELETE ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view reactions"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (public.can_view_chat_message(message_id, auth.uid()));

CREATE POLICY "Participants can add their own reaction"
ON public.chat_message_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.can_view_chat_message(message_id, auth.uid()));

CREATE POLICY "Users can remove their own reaction"
ON public.chat_message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;