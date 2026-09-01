CREATE TABLE public.analysis_score_debug (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  subject text,
  brand text,
  generation_id text,
  health_tier_mode text,
  tier_included text[] not null default '{}',
  tier_withheld text[] not null default '{}',
  profile_fields jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '{}'::jsonb
);

GRANT SELECT ON public.analysis_score_debug TO authenticated;
GRANT ALL ON public.analysis_score_debug TO service_role;

ALTER TABLE public.analysis_score_debug ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read analysis score debug"
ON public.analysis_score_debug
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX analysis_score_debug_created_idx ON public.analysis_score_debug (created_at DESC);
CREATE INDEX analysis_score_debug_user_idx ON public.analysis_score_debug (user_id, created_at DESC);