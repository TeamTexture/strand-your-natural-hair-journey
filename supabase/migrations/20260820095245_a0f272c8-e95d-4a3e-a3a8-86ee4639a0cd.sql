CREATE TABLE public.ai_model_rates (
  model TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic','lovable_gateway')),
  input_usd_per_mtok NUMERIC,
  output_usd_per_mtok NUMERIC,
  cache_write_usd_per_mtok NUMERIC,
  cache_read_usd_per_mtok NUMERIC,
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_model_rates TO authenticated;
GRANT ALL ON public.ai_model_rates TO service_role;
ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai_model_rates" ON public.ai_model_rates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ai_call_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  function_name TEXT NOT NULL,
  surface TEXT,
  stage SMALLINT NOT NULL DEFAULT 2 CHECK (stage IN (1,2)),
  provider TEXT NOT NULL CHECK (provider IN ('anthropic','lovable_gateway')),
  model TEXT NOT NULL,
  model_called BOOLEAN NOT NULL DEFAULT true,
  outcome TEXT NOT NULL DEFAULT 'completed'
    CHECK (outcome IN ('completed','rejected','error','unflushed')),
  rejection_rule TEXT,
  user_id UUID,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  duration_ms INTEGER,
  http_status INTEGER,
  error_text TEXT
);

GRANT SELECT ON public.ai_call_log TO authenticated;
GRANT ALL ON public.ai_call_log TO service_role;
ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai_call_log" ON public.ai_call_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_call_log_user_created_idx ON public.ai_call_log (user_id, created_at DESC);
CREATE INDEX ai_call_log_function_created_idx ON public.ai_call_log (function_name, created_at DESC);
CREATE INDEX ai_call_log_provider_created_idx ON public.ai_call_log (provider, created_at DESC);

CREATE VIEW public.ai_call_costs
WITH (security_invoker = true) AS
SELECT
  l.*,
  CASE
    WHEN NOT l.model_called THEN 0
    WHEN r.input_usd_per_mtok IS NULL OR r.output_usd_per_mtok IS NULL THEN NULL
    ELSE round(
      (COALESCE(l.input_tokens,0)::numeric * r.input_usd_per_mtok
       + COALESCE(l.output_tokens,0)::numeric * r.output_usd_per_mtok
       + COALESCE(l.cache_read_tokens,0)::numeric * COALESCE(r.cache_read_usd_per_mtok, r.input_usd_per_mtok)
       + COALESCE(l.cache_write_tokens,0)::numeric * COALESCE(r.cache_write_usd_per_mtok, r.input_usd_per_mtok)
      ) / 1000000, 6)
  END AS cost_usd
FROM public.ai_call_log l
LEFT JOIN public.ai_model_rates r ON r.model = l.model;

GRANT SELECT ON public.ai_call_costs TO authenticated;
GRANT ALL ON public.ai_call_costs TO service_role;