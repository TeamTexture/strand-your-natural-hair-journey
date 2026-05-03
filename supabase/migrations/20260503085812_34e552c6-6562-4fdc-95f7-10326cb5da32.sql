ALTER TABLE public.user_tools
  ADD COLUMN IF NOT EXISTS analysis_profile_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS analysis_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS idx_user_tools_user_source_url
  ON public.user_tools(user_id, source_url)
  WHERE source_url IS NOT NULL;