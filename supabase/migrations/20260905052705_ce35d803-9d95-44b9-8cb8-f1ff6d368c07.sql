ALTER TABLE public.wash_days
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_type text;

ALTER TABLE public.wash_days
  ADD CONSTRAINT wash_days_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));

ALTER TABLE public.wash_days
  ADD CONSTRAINT wash_days_media_type_check CHECK (media_type IS NULL OR media_type IN ('photo','video'));

CREATE TABLE IF NOT EXISTS public.wash_day_favourites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step text NOT NULL,
  product_id uuid REFERENCES public.user_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, step)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_day_favourites TO authenticated;
GRANT ALL ON public.wash_day_favourites TO service_role;

ALTER TABLE public.wash_day_favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own wash day favourites"
  ON public.wash_day_favourites FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER wash_day_favourites_updated_at
  BEFORE UPDATE ON public.wash_day_favourites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();