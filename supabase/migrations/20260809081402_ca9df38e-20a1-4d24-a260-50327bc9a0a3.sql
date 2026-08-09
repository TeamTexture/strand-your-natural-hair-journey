-- POLICY B (sponsored product surfaces): manuscript ingredient lookup +
-- industry/manuscript conflict register + per-claim source classes.

CREATE TABLE public.manuscript_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  chapter integer NOT NULL,
  section_heading text,
  page_start integer,
  page_end integer,
  author_text text NOT NULL,
  author_position text,
  category text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ingredient, chapter)
);

GRANT SELECT ON public.manuscript_ingredients TO authenticated;
GRANT ALL ON public.manuscript_ingredients TO service_role;
ALTER TABLE public.manuscript_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read manuscript ingredients"
  ON public.manuscript_ingredients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.industry_manuscript_conflicts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient text NOT NULL,
  topic text,
  manuscript_position text NOT NULL,
  manuscript_quote text,
  chapter integer,
  page_start integer,
  industry_position text NOT NULL,
  industry_source text,
  resolution text NOT NULL DEFAULT 'manuscript_governs',
  surface text,
  function_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_set_id uuid REFERENCES public.tip_evidence_sets(id) ON DELETE SET NULL,
  offending_text text,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  author_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.industry_manuscript_conflicts TO authenticated;
GRANT ALL ON public.industry_manuscript_conflicts TO service_role;
ALTER TABLE public.industry_manuscript_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read the conflict register"
  ON public.industry_manuscript_conflicts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can annotate the conflict register"
  ON public.industry_manuscript_conflicts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX industry_manuscript_conflicts_open_idx
  ON public.industry_manuscript_conflicts (status, last_seen_at DESC);

-- Per-claim source classes on the audit trail, and which grounding policy ran.
ALTER TABLE public.tip_evidence_sets
  ADD COLUMN policy text NOT NULL DEFAULT 'A',
  ADD COLUMN claim_sources jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX tip_evidence_sets_policy_idx
  ON public.tip_evidence_sets (policy, created_at DESC);