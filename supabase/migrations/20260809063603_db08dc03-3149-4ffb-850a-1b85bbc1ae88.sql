SET LOCAL maintenance_work_mem = '128MB';
DROP INDEX IF EXISTS public.manuscript_chunks_embedding_idx;
CREATE INDEX manuscript_chunks_embedding_idx
  ON public.manuscript_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 10);
CREATE INDEX IF NOT EXISTS manuscript_chunks_chapter_page_idx
  ON public.manuscript_chunks (chapter, page_start);