ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS water_hardness_mg_l,
  DROP COLUMN IF EXISTS water_hardness_band,
  DROP COLUMN IF EXISTS water_supplier;