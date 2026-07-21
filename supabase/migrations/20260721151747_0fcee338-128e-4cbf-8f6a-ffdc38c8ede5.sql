
-- Owner-scoped path: brand-assets/<user_id>/...
CREATE POLICY "Brand owns brand-assets folder" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Any signed-in user can read assets belonging to a currently live offer's brand
CREATE POLICY "Live brand assets readable" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.brand_user_id::text = (storage.foldername(name))[1]
        AND o.status = 'live'
        AND o.starts_on <= CURRENT_DATE
        AND o.ends_on >= CURRENT_DATE
    )
  );
