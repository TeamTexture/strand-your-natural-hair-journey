-- 1. Backfill the style-record header from legacy fields.
UPDATE public.journal_entries
SET style_name = COALESCE(
      style_name,
      NULLIF(
        btrim(
          regexp_replace(
            regexp_replace(COALESCE(title, ''), '^\[[^\]]*\]\s*', ''),
            '^Style\s+[—-]\s*', ''
          )
        ),
        ''
      )
    ),
    style_date = COALESCE(style_date, entry_date);

-- 2. Every legacy entry gets a single Step 1 carrying its note.
INSERT INTO public.journal_steps (entry_id, step_order, note)
SELECT e.id, 1, e.note
FROM public.journal_entries e
WHERE NOT EXISTS (
  SELECT 1 FROM public.journal_steps s WHERE s.entry_id = e.id
);

-- 3. Legacy photos become photo media on that Step 1.
INSERT INTO public.journal_step_media (step_id, kind, storage_path, sort_order)
SELECT s.id, 'photo', p.path, p.ord - 1
FROM public.journal_entries e
JOIN public.journal_steps s ON s.entry_id = e.id AND s.step_order = 1
CROSS JOIN LATERAL unnest(e.photo_paths) WITH ORDINALITY AS p(path, ord)
WHERE e.photo_paths IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_step_media m
    WHERE m.step_id = s.id AND m.storage_path = p.path
  );

-- 4. Legacy products become step products on that Step 1.
INSERT INTO public.journal_step_products (step_id, user_product_id)
SELECT s.id, up.id
FROM public.journal_entries e
JOIN public.journal_steps s ON s.entry_id = e.id AND s.step_order = 1
CROSS JOIN LATERAL unnest(e.products_used) AS pid
JOIN public.user_products up ON up.id = pid::uuid
WHERE e.products_used IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_step_products x
    WHERE x.step_id = s.id AND x.user_product_id = up.id
  );