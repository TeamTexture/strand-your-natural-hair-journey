INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-photos', 'journal-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own journal photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own journal photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own journal photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own journal photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'journal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);