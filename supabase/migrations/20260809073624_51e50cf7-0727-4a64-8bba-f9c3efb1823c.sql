CREATE TABLE public.manuscript_terminology (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  term text NOT NULL,
  author_position text NOT NULL,
  reserved_for text,
  banned_phrasings text[] NOT NULL DEFAULT '{}',
  chapter integer NOT NULL,
  page_start integer,
  page_end integer,
  source_quote text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (term)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manuscript_terminology TO authenticated;
GRANT ALL ON public.manuscript_terminology TO service_role;
ALTER TABLE public.manuscript_terminology ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage the terminology lexicon"
  ON public.manuscript_terminology FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.tip_evidence_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surface text NOT NULL,
  function_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  chapters integer[] NOT NULL DEFAULT '{}',
  member_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  tip jsonb,
  verified boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 1,
  stage1_tokens integer NOT NULL DEFAULT 0,
  stage2_tokens integer NOT NULL DEFAULT 0,
  verify_tokens integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tip_evidence_sets TO authenticated;
GRANT ALL ON public.tip_evidence_sets TO service_role;
ALTER TABLE public.tip_evidence_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read generated tip evidence"
  ON public.tip_evidence_sets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX tip_evidence_sets_created_idx ON public.tip_evidence_sets (created_at DESC);
CREATE INDEX tip_evidence_sets_surface_idx ON public.tip_evidence_sets (surface, created_at DESC);

CREATE TABLE public.tip_generation_rejections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evidence_set_id uuid REFERENCES public.tip_evidence_sets(id) ON DELETE CASCADE,
  surface text,
  function_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL,
  rule text NOT NULL,
  detail text,
  offending_text text,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tip_generation_rejections TO authenticated;
GRANT ALL ON public.tip_generation_rejections TO service_role;
ALTER TABLE public.tip_generation_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read generation rejections"
  ON public.tip_generation_rejections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX tip_generation_rejections_created_idx ON public.tip_generation_rejections (created_at DESC);

CREATE TRIGGER manuscript_terminology_updated_at
  BEFORE UPDATE ON public.manuscript_terminology
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();