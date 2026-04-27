ALTER TABLE public.ingredient_lists
  DROP CONSTRAINT IF EXISTS ingredient_lists_list_kind_check;

ALTER TABLE public.ingredient_lists
  ADD CONSTRAINT ingredient_lists_list_kind_check
  CHECK (list_kind = ANY (ARRAY['avoid'::text, 'favourite'::text, 'flag'::text]));