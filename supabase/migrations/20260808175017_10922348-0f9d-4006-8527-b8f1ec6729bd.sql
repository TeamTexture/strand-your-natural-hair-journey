-- Refresh the stored brand colours for the one brand with a logo using the
-- values MEASURED by the area-share extractor against its actual logo file
-- (primary = 88.0% of counted pixels, secondary = second largest bucket).
-- No brand colour is hardcoded in application code; this only re-seeds a row
-- captured before the extractor rule was finalised.
UPDATE public.brand_profiles
SET brand_colour_primary = '#fc4c01',
    brand_colour_secondary = '#f75815',
    brand_colour_source = 'logo',
    brand_colour_updated_at = now()
WHERE logo_path IS NOT NULL
  AND brand_colour_primary IS DISTINCT FROM '#fc4c01';