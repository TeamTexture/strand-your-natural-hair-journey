ALTER TABLE public.user_tools
  ADD COLUMN IF NOT EXISTS match_score integer,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;