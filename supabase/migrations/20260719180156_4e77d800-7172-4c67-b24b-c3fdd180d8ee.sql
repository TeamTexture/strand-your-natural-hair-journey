ALTER TABLE public.blood_panels
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

DROP POLICY IF EXISTS "Users read own blood thumbs" ON storage.objects;
CREATE POLICY "Users read own blood thumbs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'blood-panel-thumbs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users upload own blood thumbs" ON storage.objects;
CREATE POLICY "Users upload own blood thumbs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'blood-panel-thumbs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own blood thumbs" ON storage.objects;
CREATE POLICY "Users update own blood thumbs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'blood-panel-thumbs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own blood thumbs" ON storage.objects;
CREATE POLICY "Users delete own blood thumbs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'blood-panel-thumbs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );