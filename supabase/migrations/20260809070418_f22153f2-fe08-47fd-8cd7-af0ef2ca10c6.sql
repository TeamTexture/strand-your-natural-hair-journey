CREATE TABLE public.manuscript_chunks_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter integer NOT NULL,
  chapter_title text,
  section_heading text,
  callout_type text,
  page_start integer,
  page_end integer,
  body text NOT NULL,
  embedding extensions.vector(1536),
  token_count integer,
  ingest_version text NOT NULL DEFAULT 'clean-2026-08-09',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.manuscript_chunks_v2 TO service_role;

ALTER TABLE public.manuscript_chunks_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to manuscript chunks v2"
  ON public.manuscript_chunks_v2
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX manuscript_chunks_v2_chapter_page_idx
  ON public.manuscript_chunks_v2 (chapter, page_start);