ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

UPDATE public.user_goals SET started_at = COALESCE(started_at, created_at);
ALTER TABLE public.user_goals ALTER COLUMN started_at SET DEFAULT now();

UPDATE public.user_goals
   SET ended_at = COALESCE(ended_at, updated_at)
 WHERE status <> 'active' AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.goal_progress_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES public.user_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body_text text,
  audio_path text,
  transcription_text text,
  photo_entry_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_progress_updates TO authenticated;
GRANT ALL ON public.goal_progress_updates TO service_role;

ALTER TABLE public.goal_progress_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own goal progress updates"
  ON public.goal_progress_updates FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS goal_progress_updates_goal_idx
  ON public.goal_progress_updates (goal_id, created_at DESC);

CREATE TRIGGER goal_progress_updates_set_updated_at
  BEFORE UPDATE ON public.goal_progress_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users read their own goal progress audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'goal-progress-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload their own goal progress audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'goal-progress-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete their own goal progress audio"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'goal-progress-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
