ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS water_hardness_mg_l numeric,
  ADD COLUMN IF NOT EXISTS water_hardness_band text,
  ADD COLUMN IF NOT EXISTS water_supplier text;