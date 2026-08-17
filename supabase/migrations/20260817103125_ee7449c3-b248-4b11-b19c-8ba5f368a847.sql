CREATE TYPE public.sensitivity_scope AS ENUM ('topical', 'dietary');

CREATE TABLE public.user_sensitivities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  applies_to public.sensitivity_scope NOT NULL,
  entries_enc bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, applies_to)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sensitivities TO authenticated;
GRANT ALL ON public.user_sensitivities TO service_role;

ALTER TABLE public.user_sensitivities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own sensitivities" ON public.user_sensitivities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members insert own sensitivities" ON public.user_sensitivities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members update own sensitivities" ON public.user_sensitivities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members delete own sensitivities" ON public.user_sensitivities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_sensitivities_updated_at
  BEFORE UPDATE ON public.user_sensitivities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS topical_sensitivities_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dietary_sensitivities_confirmed_at timestamptz;