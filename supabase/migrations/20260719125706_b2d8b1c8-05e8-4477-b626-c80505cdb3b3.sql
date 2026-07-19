DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manuscript_chunks'
      AND policyname = 'No direct client access to manuscript chunks'
  ) THEN
    CREATE POLICY "No direct client access to manuscript chunks"
    ON public.manuscript_chunks
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;