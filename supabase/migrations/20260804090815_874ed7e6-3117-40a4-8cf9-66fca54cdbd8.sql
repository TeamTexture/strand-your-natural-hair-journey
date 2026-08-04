-- 1. Un-suppress the ingredients an Afro-textured hair audience most needs
--    explained. These were wrongly flagged as too obvious to tokenise.
UPDATE public.glossary_terms
SET is_common = false, updated_at = now()
WHERE is_common = true
  AND inci_key IN (
    'glycerin', 'glycerine',
    'alcohol denat', 'denatured alcohol',
    'tocopherol', 'citric acid',
    'sodium benzoate', 'potassium sorbate',
    'sodium hydroxide'
  );

-- 2. Delete junk rows: compound labels, descriptive phrases, and entries whose
--    own description admits the model didn't recognise the name. Seeded class
--    and concept terms are protected.
DELETE FROM public.glossary_terms
WHERE kind = 'molecule'
  AND (
    inci_key LIKE '% and %'
    OR display_name ILIKE '% and %'
    OR display_name LIKE '%&%'
    OR display_name LIKE '%/%'
    OR display_name LIKE '%,%'
    OR display_name ~* '\y(system|systems|concentration|blend|complex|combination|formulation|ratio|percentage)\y'
    OR array_length(regexp_split_to_array(btrim(display_name), '\s+'), 1) > 5
    OR what_it_is ~* '\y(not a (real|recognised|known)|unrecognised|unknown ingredient|does not appear to be|is not an ingredient|not an ingredient|descriptive (phrase|term)|marketing (term|claim)|cannot identify|unable to identify)\y'
  );
