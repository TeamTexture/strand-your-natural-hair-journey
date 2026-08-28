CREATE TABLE IF NOT EXISTS public.ai_content_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  surface text,
  user_id uuid,
  subject text,
  check_name text NOT NULL,
  field text NOT NULL,
  phrase text,
  rule text,
  action text NOT NULL DEFAULT 'field_nulled',
  attempt integer
);

CREATE INDEX IF NOT EXISTS ai_content_rejections_created_idx
  ON public.ai_content_rejections (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_content_rejections_check_idx
  ON public.ai_content_rejections (check_name, created_at DESC);

GRANT SELECT ON public.ai_content_rejections TO authenticated;
GRANT ALL ON public.ai_content_rejections TO service_role;

ALTER TABLE public.ai_content_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read content rejections"
  ON public.ai_content_rejections
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));