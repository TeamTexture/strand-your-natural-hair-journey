-- 1. One-off cleanup: keep the earliest row per user per normalised meal name.
DELETE FROM public.user_saved_meals m
USING public.user_saved_meals keep
WHERE m.user_id = keep.user_id
  AND lower(btrim(m.name)) = lower(btrim(keep.name))
  AND (keep.created_at, keep.id) < (m.created_at, m.id);

-- 2. Normalised identity column + database-level uniqueness guarantee.
ALTER TABLE public.user_saved_meals
  ADD COLUMN IF NOT EXISTS name_key text
  GENERATED ALWAYS AS (lower(btrim(name))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS user_saved_meals_user_name_key_uq
  ON public.user_saved_meals(user_id, name_key);