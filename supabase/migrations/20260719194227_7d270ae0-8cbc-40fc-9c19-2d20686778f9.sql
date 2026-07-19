
CREATE TABLE public.user_saved_meals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  cuisine text,
  time_minutes integer,
  summary text,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_saved_meals_user ON public.user_saved_meals(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_meals TO authenticated;
GRANT ALL ON public.user_saved_meals TO service_role;

ALTER TABLE public.user_saved_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own saved meals"
  ON public.user_saved_meals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved meals"
  ON public.user_saved_meals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved meals"
  ON public.user_saved_meals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved meals"
  ON public.user_saved_meals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
