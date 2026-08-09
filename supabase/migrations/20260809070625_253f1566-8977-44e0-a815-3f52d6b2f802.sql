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
  SELECT c.chapter, c.chapter_title,
         CASE WHEN c.callout_type IS NOT NULL
              THEN coalesce(c.section_heading || ' — ', '') || '+ ' || c.callout_type
              ELSE c.section_heading END,
         c.page_start, c.page_end, c.body, c.token_count
  FROM public.manuscript_chunks_v2 c
  WHERE c.chapter = ANY(chapter_numbers)
  ORDER BY c.chapter, c.page_start NULLS LAST, c.page_end NULLS LAST, c.id
$$;

REVOKE ALL ON FUNCTION public.manuscript_chapters(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manuscript_chapters(integer[]) TO service_role;

CREATE OR REPLACE FUNCTION public.match_manuscript_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 4,
  chapter_filter int[] DEFAULT NULL
)
RETURNS TABLE (
  body text,
  chapter integer,
  chapter_title text,
  section_heading text,
  page_start integer,
  page_end integer,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    mc.body,
    mc.chapter,
    mc.chapter_title,
    CASE WHEN mc.callout_type IS NOT NULL
         THEN coalesce(mc.section_heading || ' — ', '') || '+ ' || mc.callout_type
         ELSE mc.section_heading END,
    mc.page_start,
    mc.page_end,
    (1 - (mc.embedding <=> query_embedding))::double precision AS similarity
  FROM public.manuscript_chunks_v2 mc
  WHERE mc.embedding IS NOT NULL
    AND (chapter_filter IS NULL OR mc.chapter = ANY(chapter_filter))
  ORDER BY mc.embedding <=> query_embedding
  LIMIT GREATEST(LEAST(COALESCE(match_count, 4), 20), 1)
$$;

REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM anon;
REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) TO service_role;