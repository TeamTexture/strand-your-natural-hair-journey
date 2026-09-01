CREATE TABLE public.product_ingredient_facts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identity_key text NOT NULL,
  ingredients_hash text NOT NULL,
  model_version text NOT NULL,
  product_name text,
  product_brand text,
  ingredient_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_function text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_ingredient_facts_identity UNIQUE (identity_key, ingredients_hash, model_version)
);

GRANT SELECT ON public.product_ingredient_facts TO authenticated;
GRANT ALL ON public.product_ingredient_facts TO service_role;

ALTER TABLE public.product_ingredient_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read shared ingredient facts"
  ON public.product_ingredient_facts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX product_ingredient_facts_lookup
  ON public.product_ingredient_facts (identity_key, ingredients_hash, model_version);