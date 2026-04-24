CREATE TABLE public.goal_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES public.user_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note text,
  voice_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX goal_updates_goal_id_idx ON public.goal_updates(goal_id, created_at DESC);

ALTER TABLE public.goal_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own goal updates" ON public.goal_updates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own goal updates" ON public.goal_updates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own goal updates" ON public.goal_updates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own goal updates" ON public.goal_updates
  FOR DELETE USING (auth.uid() = user_id);