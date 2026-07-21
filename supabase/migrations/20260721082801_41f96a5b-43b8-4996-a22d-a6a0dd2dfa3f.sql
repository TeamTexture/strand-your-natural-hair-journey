
ALTER TABLE public.user_style_profile
  ADD COLUMN IF NOT EXISTS colour_type text,
  ADD COLUMN IF NOT EXISTS colour_product text,
  ADD COLUMN IF NOT EXISTS colour_last_treated text,
  ADD COLUMN IF NOT EXISTS colour_reaction boolean,
  ADD COLUMN IF NOT EXISTS colour_reaction_details text;
