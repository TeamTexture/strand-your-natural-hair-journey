ALTER TABLE public.ingredients RENAME TO glossary_terms;

ALTER TABLE public.glossary_terms
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'molecule',
  ADD COLUMN IF NOT EXISTS class_category text,
  ADD COLUMN IF NOT EXISTS match_keywords text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.glossary_terms
  DROP CONSTRAINT IF EXISTS glossary_terms_kind_check;
ALTER TABLE public.glossary_terms
  ADD CONSTRAINT glossary_terms_kind_check CHECK (kind IN ('molecule','class','concept'));

CREATE INDEX IF NOT EXISTS glossary_terms_kind_idx ON public.glossary_terms (kind);

GRANT SELECT ON public.glossary_terms TO authenticated;
GRANT SELECT ON public.glossary_terms TO anon;
GRANT ALL ON public.glossary_terms TO service_role;