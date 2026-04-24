-- Per-user product rating + the ingredient list captured at rating time
CREATE TABLE public.product_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_key TEXT NOT NULL,
  product_name TEXT,
  product_brand TEXT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_key)
);

ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own product ratings"
  ON public.product_ratings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own product ratings"
  ON public.product_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own product ratings"
  ON public.product_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own product ratings"
  ON public.product_ratings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_product_ratings_updated_at
  BEFORE UPDATE ON public.product_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-derived avoid + favourites entries
CREATE TABLE public.ingredient_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  list_kind TEXT NOT NULL CHECK (list_kind IN ('avoid', 'favourite')),
  ingredient TEXT NOT NULL,
  reason TEXT NOT NULL,
  product_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, list_kind, ingredient)
);

ALTER TABLE public.ingredient_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ingredient lists"
  ON public.ingredient_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ingredient lists"
  ON public.ingredient_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ingredient lists"
  ON public.ingredient_lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own ingredient lists"
  ON public.ingredient_lists FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_ingredient_lists_updated_at
  BEFORE UPDATE ON public.ingredient_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_ratings_user_rating ON public.product_ratings(user_id, rating);
CREATE INDEX idx_ingredient_lists_user_kind ON public.ingredient_lists(user_id, list_kind);