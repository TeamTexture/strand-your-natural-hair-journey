-- Second colour measured from the actual logo (second largest pixel bucket).
UPDATE public.brand_profiles
SET brand_colour_secondary = '#f75815',
    brand_colour_updated_at = now()
WHERE logo_path IS NOT NULL
  AND brand_colour_primary = '#fc4c01';