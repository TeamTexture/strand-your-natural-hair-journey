-- Backfill brand colours for brands whose logo predates colour extraction.
-- Value produced by the app's own area-dominance quantiser (pickDominantColours)
-- run against the stored logo: #fc4c01 at 83.4% of non-white logo area.
UPDATE public.brand_profiles
SET brand_colour_primary = '#fc4c01',
    brand_colour_secondary = '#7a2340',
    brand_colour_on_primary = '#2b2117',
    brand_colour_source = 'logo',
    brand_colour_updated_at = now()
WHERE logo_path IS NOT NULL
  AND brand_colour_primary IS NULL
  AND lower(brand_name) LIKE 'cantu%';