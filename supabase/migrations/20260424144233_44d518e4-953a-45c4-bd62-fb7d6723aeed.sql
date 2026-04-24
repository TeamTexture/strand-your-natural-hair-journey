-- Tables
CREATE TABLE public.moodboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🌸',
  gradient TEXT NOT NULL DEFAULT 'from-[#C8B89A] to-[#D4B96A]',
  is_favourites BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.moodboard_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  board_id UUID NOT NULL REFERENCES public.moodboards(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  is_favourite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX moodboards_user_idx ON public.moodboards(user_id);
CREATE INDEX moodboard_images_board_idx ON public.moodboard_images(board_id);
CREATE INDEX moodboard_images_user_idx ON public.moodboard_images(user_id);

-- RLS
ALTER TABLE public.moodboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own boards" ON public.moodboards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own boards" ON public.moodboards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own boards" ON public.moodboards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own boards" ON public.moodboards FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users view own moodboard images" ON public.moodboard_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own moodboard images" ON public.moodboard_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own moodboard images" ON public.moodboard_images FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own moodboard images" ON public.moodboard_images FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER moodboards_set_updated_at
BEFORE UPDATE ON public.moodboards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('moodboard-images', 'moodboard-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage files inside their own user_id/ folder
CREATE POLICY "Users view own moodboard files"
ON storage.objects FOR SELECT
USING (bucket_id = 'moodboard-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own moodboard files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'moodboard-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own moodboard files"
ON storage.objects FOR DELETE
USING (bucket_id = 'moodboard-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Auto-create a Favourites board for new users
CREATE OR REPLACE FUNCTION public.create_favourites_board()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.moodboards (user_id, name, emoji, gradient, is_favourites)
  VALUES (NEW.id, 'Favourites', '❤️', 'from-primary to-[#8B6914]', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_moodboard ON auth.users;
CREATE TRIGGER on_auth_user_created_moodboard
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_favourites_board();

-- Backfill: ensure every existing user has a Favourites board
INSERT INTO public.moodboards (user_id, name, emoji, gradient, is_favourites)
SELECT u.id, 'Favourites', '❤️', 'from-primary to-[#8B6914]', true
FROM auth.users u
LEFT JOIN public.moodboards m ON m.user_id = u.id AND m.is_favourites = true
WHERE m.id IS NULL;