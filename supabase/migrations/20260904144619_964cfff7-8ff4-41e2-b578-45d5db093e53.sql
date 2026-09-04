ALTER TABLE public.scan_timings
  ADD COLUMN IF NOT EXISTS cpu_ms integer,
  ADD COLUMN IF NOT EXISTS cpu_pct_of_limit numeric;