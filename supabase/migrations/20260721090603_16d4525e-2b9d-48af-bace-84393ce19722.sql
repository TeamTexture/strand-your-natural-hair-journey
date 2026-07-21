
-- Pro photo bucket policies. Path convention: <user_id>/<filename>.
CREATE POLICY "Pros manage own photos - read"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'pro-photos');

CREATE POLICY "Pros insert own photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pro-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Pros update own photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pro-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Pros delete own photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pro-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
