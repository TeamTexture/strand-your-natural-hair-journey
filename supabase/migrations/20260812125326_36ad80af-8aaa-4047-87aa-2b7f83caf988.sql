ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  'Set when the member asks for their own account to be erased. Data stays intact for 30 days; clearing this column cancels the request. Only ever set/cleared by the member.';

ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_resumes_at timestamptz;

COMMENT ON COLUMN public.consumer_subscriptions.paused IS
  'True while Stripe pause_collection is set. Stripe leaves status = active when paused, so entitlement must read this column, never status alone.';

CREATE TABLE IF NOT EXISTS public.account_erasure_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  dry_run boolean NOT NULL DEFAULT true,
  cap integer NOT NULL,
  eligible_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  user_ids uuid[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

GRANT SELECT ON public.account_erasure_runs TO authenticated;
GRANT ALL ON public.account_erasure_runs TO service_role;

ALTER TABLE public.account_erasure_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read erasure runs"
  ON public.account_erasure_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS profiles_deletion_requested_at_idx
  ON public.profiles (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;