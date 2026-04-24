
-- Products owned by users (shelf, wishlist, off-shelf)
CREATE TABLE IF NOT EXISTS public.user_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_key text NOT NULL,
  name text NOT NULL,
  brand text,
  category text,
  image_url text,
  storage_path text,
  ingredients text[] NOT NULL DEFAULT '{}',
  key_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_summary text,
  match_score smallint,
  rating smallint,
  on_shelf boolean NOT NULL DEFAULT false,
  on_wishlist boolean NOT NULL DEFAULT false,
  previously_on_shelf boolean NOT NULL DEFAULT false,
  added_to_shelf_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_key)
);

ALTER TABLE public.user_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own products" ON public.user_products
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own products" ON public.user_products
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own products" ON public.user_products
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own products" ON public.user_products
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_products_updated_at
  BEFORE UPDATE ON public.user_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_products_user_shelf ON public.user_products (user_id, on_shelf);
CREATE INDEX IF NOT EXISTS idx_user_products_user_wishlist ON public.user_products (user_id, on_wishlist);

-- Wash day log
CREATE TABLE IF NOT EXISTS public.wash_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wash_date date NOT NULL DEFAULT CURRENT_DATE,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  heat_treatment jsonb,
  scalp_feel text,
  breakage text,
  hair_feel_note text,
  hair_feel_voice_url text,
  style_after text,
  duration_min integer,
  stress_level smallint,
  ai_insight text,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wash_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wash days" ON public.wash_days
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own wash days" ON public.wash_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own wash days" ON public.wash_days
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own wash days" ON public.wash_days
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_wash_days_updated_at
  BEFORE UPDATE ON public.wash_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wash_days_user_date ON public.wash_days (user_id, wash_date DESC);
