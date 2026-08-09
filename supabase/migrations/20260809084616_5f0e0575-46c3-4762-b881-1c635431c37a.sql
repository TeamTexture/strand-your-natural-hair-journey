CREATE TABLE public.author_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  position text NOT NULL,
  applies_to text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.author_clarifications TO anon;
GRANT SELECT ON public.author_clarifications TO authenticated;
GRANT ALL ON public.author_clarifications TO service_role;

ALTER TABLE public.author_clarifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active clarifications are publicly readable"
  ON public.author_clarifications FOR SELECT
  USING (is_active);

CREATE POLICY "Admins can read all clarifications"
  ON public.author_clarifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert clarifications"
  ON public.author_clarifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update clarifications"
  ON public.author_clarifications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_author_clarifications_updated_at
  BEFORE UPDATE ON public.author_clarifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tip_evidence_sets
  ADD COLUMN IF NOT EXISTS clarifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clarification_governed boolean NOT NULL DEFAULT false;