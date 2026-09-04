CREATE TABLE public.scan_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  phase text,
  user_id uuid,
  error_name text,
  error_message text,
  status_code integer,
  elapsed_ms integer,
  ingredient_count integer,
  meta jsonb
);

GRANT ALL ON public.scan_errors TO service_role;
GRANT SELECT ON public.scan_errors TO authenticated;

ALTER TABLE public.scan_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scan errors"
ON public.scan_errors
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX scan_errors_created_at_idx ON public.scan_errors (created_at DESC);
CREATE INDEX scan_errors_function_idx ON public.scan_errors (function_name, created_at DESC);