ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS featured_from date,
  ADD COLUMN IF NOT EXISTS featured_until date,
  ADD COLUMN IF NOT EXISTS featured_rank smallint;

COMMENT ON COLUMN public.pro_profiles.featured_from IS 'Featured directory slot start (inclusive). NULL = already started, but only when featured_until is set.';
COMMENT ON COLUMN public.pro_profiles.featured_until IS 'Featured directory slot end (inclusive). NULL = no end date, but only when featured_from is set.';
COMMENT ON COLUMN public.pro_profiles.featured_rank IS 'Ordering within the featured slot, ascending. Lower wins.';

CREATE INDEX IF NOT EXISTS pro_profiles_featured_idx
  ON public.pro_profiles (featured_rank, display_name)
  WHERE featured_from IS NOT NULL OR featured_until IS NOT NULL;