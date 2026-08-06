CREATE TABLE public.blood_marker_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker text NOT NULL UNIQUE,
  display_name text NOT NULL,
  unit text,
  ref_range_low numeric,
  ref_range_high numeric,
  plain_meaning text,
  hair_link_status text NOT NULL DEFAULT 'none'
    CHECK (hair_link_status IN ('established','limited_evidence','none')),
  hair_link_summary text,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blood_marker_reference TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_marker_reference TO authenticated;
GRANT ALL ON public.blood_marker_reference TO service_role;

ALTER TABLE public.blood_marker_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Blood marker reference is publicly readable"
  ON public.blood_marker_reference FOR SELECT USING (true);

CREATE POLICY "Admins can insert blood marker reference"
  ON public.blood_marker_reference FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update blood marker reference"
  ON public.blood_marker_reference FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blood marker reference"
  ON public.blood_marker_reference FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER blood_marker_reference_set_updated_at
  BEFORE UPDATE ON public.blood_marker_reference
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX blood_marker_reference_status_idx
  ON public.blood_marker_reference (hair_link_status);