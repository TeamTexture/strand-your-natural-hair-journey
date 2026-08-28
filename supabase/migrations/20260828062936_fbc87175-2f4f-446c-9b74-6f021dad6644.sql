CREATE POLICY "Curated offer images readable to members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'brand-assets'
  AND (storage.foldername(name))[1] = 'curated'
);