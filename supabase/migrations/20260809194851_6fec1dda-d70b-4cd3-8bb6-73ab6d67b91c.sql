CREATE TABLE public.manuscript_evidence_cache (
  cache_key text PRIMARY KEY,
  surface text NOT NULL,
  revision text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.manuscript_evidence_cache TO service_role;

ALTER TABLE public.manuscript_evidence_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX manuscript_evidence_cache_expires_idx ON public.manuscript_evidence_cache (expires_at);