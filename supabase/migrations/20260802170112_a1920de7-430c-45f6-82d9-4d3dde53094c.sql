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
    mc.section_heading,
    mc.page_start,
    mc.page_end,
    (1 - (mc.embedding <=> query_embedding))::double precision AS similarity
  FROM public.manuscript_chunks mc
  WHERE mc.embedding IS NOT NULL
    AND (chapter_filter IS NULL OR mc.chapter = ANY(chapter_filter))
  ORDER BY mc.embedding <=> query_embedding
  LIMIT GREATEST(LEAST(COALESCE(match_count, 4), 20), 1)
$$;

REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM anon;
REVOKE ALL ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_manuscript_chunks(vector, int, int[]) TO service_role;