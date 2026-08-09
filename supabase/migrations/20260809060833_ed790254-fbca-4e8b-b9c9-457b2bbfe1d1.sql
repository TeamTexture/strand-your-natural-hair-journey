-- 1. chapter_title may be unknown: NULL is correct when it cannot be verified from the source text.
ALTER TABLE public.manuscript_chunks ALTER COLUMN chapter_title DROP NOT NULL;

-- 2. Whole-chapter retrieval: return every chunk of the requested chapters in reading order.
CREATE OR REPLACE FUNCTION public.manuscript_chapters(chapter_numbers integer[])
RETURNS TABLE (
  chapter integer,
  chapter_title text,
  section_heading text,
  page_start integer,
  page_end integer,
  body text,
  token_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.chapter, c.chapter_title, c.section_heading, c.page_start, c.page_end, c.body, c.token_count
  FROM public.manuscript_chunks c
  WHERE c.chapter = ANY(chapter_numbers)
  ORDER BY c.chapter, c.page_start NULLS LAST, c.page_end NULLS LAST, c.id
$$;

REVOKE ALL ON FUNCTION public.manuscript_chapters(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manuscript_chapters(integer[]) TO service_role;

-- 3. Fidelity rejection log — the author-reviewable record of every claim the
--    verifier refused because the retrieved manuscript did not support it.
CREATE TABLE IF NOT EXISTS public.ai_fidelity_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  surface text,
  field_path text,
  claim text NOT NULL,
  reason text NOT NULL,
  rule_id text,
  attempt integer NOT NULL DEFAULT 1,
  regenerated boolean NOT NULL DEFAULT false,
  chapters_in_context integer[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_fidelity_rejections TO service_role;
ALTER TABLE public.ai_fidelity_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read fidelity rejections"
ON public.ai_fidelity_rejections
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_fidelity_rejections_created_idx
  ON public.ai_fidelity_rejections (created_at DESC);