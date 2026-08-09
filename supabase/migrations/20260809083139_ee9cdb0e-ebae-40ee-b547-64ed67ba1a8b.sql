ALTER TABLE public.manuscript_terminology
  ADD COLUMN IF NOT EXISTS loose_usage text,
  ADD COLUMN IF NOT EXISTS accurate_explanation text,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'explain';