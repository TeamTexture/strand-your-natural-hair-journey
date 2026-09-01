CREATE TABLE public.welcome_voicenote (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audio_path text NOT NULL,
  transcript text,
  duration_ms integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_voicenote TO authenticated;
GRANT ALL ON public.welcome_voicenote TO service_role;

ALTER TABLE public.welcome_voicenote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage the welcome voicenote"
ON public.welcome_voicenote FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can play back the stored welcome recording before any member has it.
CREATE POLICY "chat_images_read_welcome_voicenote"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.welcome_voicenote w WHERE w.audio_path = objects.name)
);

ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS welcome_dm_sent_at timestamptz;