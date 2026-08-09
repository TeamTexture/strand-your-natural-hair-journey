REVOKE EXECUTE ON FUNCTION public.renumber_journal_steps() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_journal_steps_updated_at() FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Members read own journal videos" ON storage.objects;
CREATE POLICY "Members read own journal videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'journal-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Members upload own journal videos" ON storage.objects;
CREATE POLICY "Members upload own journal videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'journal-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Members update own journal videos" ON storage.objects;
CREATE POLICY "Members update own journal videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'journal-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Members delete own journal videos" ON storage.objects;
CREATE POLICY "Members delete own journal videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'journal-videos' AND auth.uid()::text = (storage.foldername(name))[1]);