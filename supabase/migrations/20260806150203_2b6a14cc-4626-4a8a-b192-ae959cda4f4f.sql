CREATE TABLE public.user_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_challenges_user_idx ON public.user_challenges (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_challenges TO authenticated;
GRANT ALL ON public.user_challenges TO service_role;

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own challenges"
  ON public.user_challenges FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_challenges_set_updated_at
  BEFORE UPDATE ON public.user_challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from existing goal challenges (active + future goals only)
INSERT INTO public.user_challenges (user_id, label)
SELECT DISTINCT ON (g.user_id, lower(btrim(c)))
       g.user_id, btrim(c)
FROM public.user_goals g
CROSS JOIN LATERAL unnest(COALESCE(g.challenges, ARRAY[]::text[])) AS c
WHERE btrim(c) <> ''
  AND COALESCE(g.status, 'in_progress') IN ('in_progress', 'future')
  AND g.ended_at IS NULL;