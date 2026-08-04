ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS match_score_computed_at timestamptz;

UPDATE public.user_products
SET match_score_computed_at = COALESCE(updated_at, created_at, now())
WHERE match_score IS NOT NULL AND match_score_computed_at IS NULL;