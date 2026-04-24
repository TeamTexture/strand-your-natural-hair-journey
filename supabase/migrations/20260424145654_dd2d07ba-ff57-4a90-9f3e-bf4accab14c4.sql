-- ============ user_product_photos table ============
CREATE TABLE public.user_product_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_key TEXT NOT NULL,
  product_name TEXT,
  product_brand TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_key)
);

ALTER TABLE public.user_product_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own product photos"
  ON public.user_product_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own product photos"
  ON public.user_product_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own product photos"
  ON public.user_product_photos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own product photos"
  ON public.user_product_photos FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_user_product_photos_updated_at
  BEFORE UPDATE ON public.user_product_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ product-photos storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own product photo files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own product photo files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own product photo files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own product photo files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ avatars storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own avatar files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own avatar files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);