CREATE TABLE public.curated_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_passages jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text,
  manuscript_grounded boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.curated_content TO authenticated;
GRANT ALL ON public.curated_content TO service_role;

ALTER TABLE public.curated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read published curated content"
  ON public.curated_content FOR SELECT TO authenticated
  USING (status = 'published');

CREATE POLICY "Admins read all curated content"
  ON public.curated_content FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER curated_content_set_updated_at
  BEFORE UPDATE ON public.curated_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX curated_content_key_status_idx ON public.curated_content (content_key, status);