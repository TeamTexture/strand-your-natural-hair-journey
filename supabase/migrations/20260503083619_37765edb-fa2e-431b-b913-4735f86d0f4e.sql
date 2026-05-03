-- Add profile-snapshot tracking + source_url to user_products so the
-- client can decide cache vs re-analyse on a re-scan.
ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS analysis_profile_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS analysis_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS idx_user_products_user_source_url
  ON public.user_products (user_id, source_url)
  WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_products_user_key_hash
  ON public.user_products (user_id, product_key, analysis_profile_snapshot_hash);
