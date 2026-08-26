ALTER TABLE public.ai_call_log
  ADD COLUMN IF NOT EXISTS generation_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS retry_reason TEXT;

CREATE INDEX IF NOT EXISTS ai_call_log_generation_idx
  ON public.ai_call_log (generation_id, attempt_number);

DROP VIEW IF EXISTS public.ai_call_costs;

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