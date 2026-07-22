-- Replace the owner/admin-only read policy on brand-assets with one that also
-- lets any authenticated member view the creative of an offer whose status is
-- paid_scheduled / live / ended. Ended offers must render their full-size
-- creative on the public brand page + past-campaign lists.
DROP POLICY IF EXISTS "Live brand offer assets readable" ON storage.objects;
DROP POLICY IF EXISTS "Live brand assets readable" ON storage.objects;

CREATE POLICY "Brand offer assets readable to members"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.brand_offers o
        WHERE (o.brand_user_id)::text = (storage.foldername(name))[1]
          AND o.status IN ('paid_scheduled','live','ended')
      )
    )
  );