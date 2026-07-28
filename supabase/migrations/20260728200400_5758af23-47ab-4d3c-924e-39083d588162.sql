DROP POLICY IF EXISTS "Brand offer assets readable to members" ON storage.objects;

CREATE POLICY "Brand offer assets readable to members"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'brand-assets'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.status IN ('paid_scheduled','live','ended')
        AND (
          (o.brand_user_id)::text = (storage.foldername(objects.name))[1]
          OR o.hero_image_path = objects.name
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.brand_products p
      JOIN public.brand_offers o2 ON o2.id = p.offer_id
      WHERE o2.status IN ('paid_scheduled','live','ended')
        AND objects.name = ANY (p.image_urls)
    )
  )
);