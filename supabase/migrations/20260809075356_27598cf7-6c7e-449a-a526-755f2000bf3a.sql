ALTER TABLE public.tip_evidence_sets
  ADD COLUMN IF NOT EXISTS coverage text NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS coverage_reason text,
  ADD COLUMN IF NOT EXISTS governing_principle text,
  ADD COLUMN IF NOT EXISTS external_claims jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS tip_evidence_sets_coverage_idx
  ON public.tip_evidence_sets (coverage, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_tip_coverage_distribution(_days integer DEFAULT 30)
RETURNS TABLE (
  surface text,
  total bigint,
  explicit_count bigint,
  extension_count bigint,
  supplement_count bigint,
  supplement_pct numeric,
  flagged boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.surface,
    count(*) AS total,
    count(*) FILTER (WHERE e.coverage = 'explicit') AS explicit_count,
    count(*) FILTER (WHERE e.coverage = 'extension') AS extension_count,
    count(*) FILTER (WHERE e.coverage = 'supplement') AS supplement_count,
    round(100.0 * count(*) FILTER (WHERE e.coverage = 'supplement') / greatest(count(*), 1), 1) AS supplement_pct,
    (100.0 * count(*) FILTER (WHERE e.coverage = 'supplement') / greatest(count(*), 1)) > 15 AS flagged
  FROM public.tip_evidence_sets e
  WHERE e.created_at > now() - make_interval(days => greatest(_days, 1))
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY e.surface
  ORDER BY count(*) DESC
$$;

GRANT EXECUTE ON FUNCTION public.admin_tip_coverage_distribution(integer) TO authenticated;