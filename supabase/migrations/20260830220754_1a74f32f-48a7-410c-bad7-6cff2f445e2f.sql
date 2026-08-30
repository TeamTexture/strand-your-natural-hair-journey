CREATE TABLE public.subscription_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('consumer','professional','brand')),
  stripe_subscription_id text,
  stripe_customer_id text,
  cancellation_reason text,
  cancellation_comment text,
  cancellation_source text,
  canceled_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_event_key text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_cancellations TO authenticated;
GRANT ALL ON public.subscription_cancellations TO service_role;

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view subscription cancellations"
ON public.subscription_cancellations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX subscription_cancellations_event_key_idx
  ON public.subscription_cancellations (stripe_event_key);
CREATE INDEX subscription_cancellations_user_idx
  ON public.subscription_cancellations (user_id, recorded_at DESC);

CREATE TRIGGER update_subscription_cancellations_updated_at
BEFORE UPDATE ON public.subscription_cancellations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();