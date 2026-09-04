CREATE TABLE public.scan_timings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  function_name TEXT NOT NULL,
  surface TEXT,
  user_id UUID,
  ocr_ms INTEGER,
  retrieval_ms INTEGER,
  analysis_ms INTEGER,
  total_ms INTEGER,
  ingredient_count INTEGER,
  retrieval_call_count INTEGER,
  attempts INTEGER,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  meta JSONB
);

GRANT ALL ON public.scan_timings TO service_role;
GRANT SELECT ON public.scan_timings TO authenticated;

ALTER TABLE public.scan_timings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scan timings"
ON public.scan_timings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX scan_timings_created_at_idx ON public.scan_timings (created_at DESC);