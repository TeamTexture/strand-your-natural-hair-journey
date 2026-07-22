
-- forum-images: authors upload under their own user_id prefix; any plus member (or admin) may read.
CREATE POLICY "Plus members read forum images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'forum-images' AND (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "Plus members upload own forum images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'forum-images'
    AND public.has_active_plus_subscription(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Author or admin delete forum image" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'forum-images'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin'))
  );

-- strand-plus-library: admins upload/manage; plus members read via signed URL.
CREATE POLICY "Plus members read library" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'strand-plus-library' AND (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "Admins upload library" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'strand-plus-library' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins update library" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'strand-plus-library' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'strand-plus-library' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins delete library" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'strand-plus-library' AND public.has_role(auth.uid(),'admin'));
