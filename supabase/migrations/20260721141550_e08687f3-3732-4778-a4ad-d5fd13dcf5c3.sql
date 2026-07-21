
CREATE POLICY "Pros view client avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.has_active_client_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Admins view all avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.has_role(auth.uid(), 'admin')
);
