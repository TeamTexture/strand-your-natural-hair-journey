
-- Admin bypass policies on brand tables
CREATE POLICY "Admins manage brand profiles" ON public.brand_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage brand offers" ON public.brand_offers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage brand placements" ON public.brand_offer_placements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage brand products" ON public.brand_products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read brand stats" ON public.brand_offer_stats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Consumers read approved placements to know unavailable dates
CREATE POLICY "Signed-in read approved placements" ON public.brand_offer_placements FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.brand_offers o WHERE o.id = brand_offer_placements.offer_id AND o.status IN ('approved_unpaid','paid_scheduled','live','ended'))
);

-- Seed brand placement daily rates (pence)
INSERT INTO public.platform_settings (key, value) VALUES
  ('brand_placement_rates', '{"home":7500,"products":5000,"wash_day":10000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Storage policies for brand-assets bucket (per-owner folder)
CREATE POLICY "Brand can manage own asset folder" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'brand-assets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')))
WITH CHECK (bucket_id = 'brand-assets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Live brand offer assets readable" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'brand-assets' AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.brand_user_id::text = (storage.foldername(name))[1]
        AND o.status IN ('live','paid_scheduled','ended')
    )
  )
);
