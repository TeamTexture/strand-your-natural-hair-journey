-- LAYER 1: global ingredient glossary (shared reference data, no user_id)
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inci_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  phonetic text,
  category text,
  what_it_is text,
  aliases text[] NOT NULL DEFAULT '{}',
  is_common boolean NOT NULL DEFAULT false,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ingredient glossary readable by authenticated users"
  ON public.ingredients FOR SELECT TO authenticated USING (true);

CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ingredients_aliases_idx ON public.ingredients USING gin (aliases);

-- LAYER 2: ingredient <-> product index
CREATE TABLE public.product_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_product_id uuid NOT NULL REFERENCES public.user_products(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  position integer,
  role_in_product text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_product_id, ingredient_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_ingredients TO authenticated;
GRANT ALL ON public.product_ingredients TO service_role;

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own product ingredient links"
  ON public.product_ingredients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_products p
    WHERE p.id = product_ingredients.user_product_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Members insert their own product ingredient links"
  ON public.product_ingredients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_products p
    WHERE p.id = product_ingredients.user_product_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Members update their own product ingredient links"
  ON public.product_ingredients FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_products p
    WHERE p.id = product_ingredients.user_product_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_products p
    WHERE p.id = product_ingredients.user_product_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Members delete their own product ingredient links"
  ON public.product_ingredients FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_products p
    WHERE p.id = product_ingredients.user_product_id AND p.user_id = auth.uid()
  ));

CREATE TRIGGER product_ingredients_set_updated_at
  BEFORE UPDATE ON public.product_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX product_ingredients_ingredient_idx ON public.product_ingredients (ingredient_id);
CREATE INDEX product_ingredients_product_idx ON public.product_ingredients (user_product_id);