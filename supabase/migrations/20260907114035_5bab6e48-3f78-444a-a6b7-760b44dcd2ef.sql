CREATE TABLE public.complimentary_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  end_date date,
  reason text,
  note text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.complimentary_grants TO authenticated;
GRANT ALL ON public.complimentary_grants TO service_role;

ALTER TABLE public.complimentary_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view complimentary grants"
ON public.complimentary_grants FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can add complimentary grants"
ON public.complimentary_grants FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX complimentary_grants_user_idx ON public.complimentary_grants (user_id, created_at DESC);

ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS complimentary_until timestamptz;