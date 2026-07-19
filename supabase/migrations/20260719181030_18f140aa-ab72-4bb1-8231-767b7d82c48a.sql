-- Backfill blood_panels.label for older rows that were saved before the
-- document-title extraction landed. Prefer test_type + lab_name, otherwise
-- lab_name alone, otherwise a dated fallback so nothing shows as "Blood test".
UPDATE public.blood_panels
SET label = CASE
  WHEN test_type IS NOT NULL AND lab_name IS NOT NULL
    THEN test_type || ' — ' || lab_name
  WHEN test_type IS NOT NULL THEN test_type
  WHEN lab_name IS NOT NULL THEN lab_name || ' blood test'
  WHEN panel_date IS NOT NULL THEN 'Blood test — ' || to_char(panel_date, 'YYYY-MM-DD')
  ELSE label
END
WHERE (label IS NULL OR btrim(label) = '' OR lower(label) = 'blood test')
  AND status <> 'scheduled';