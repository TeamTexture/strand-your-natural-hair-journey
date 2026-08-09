CREATE TABLE public.brand_profile_admin_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.brand_profile_admin_edits TO authenticated;
GRANT ALL ON public.brand_profile_admin_edits TO service_role;

ALTER TABLE public.brand_profile_admin_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read brand profile edit log"
ON public.brand_profile_admin_edits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write brand profile edit log"
ON public.brand_profile_admin_edits FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_user_id = auth.uid());

CREATE INDEX brand_profile_admin_edits_brand_idx
ON public.brand_profile_admin_edits (brand_user_id, created_at DESC);