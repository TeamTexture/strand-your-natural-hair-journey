
CREATE TABLE public.brand_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  price_id TEXT,
  status TEXT NOT NULL DEFAULT 'none',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brand_subscriptions TO authenticated;
GRANT ALL ON public.brand_subscriptions TO service_role;

ALTER TABLE public.brand_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands read own subscription"
  ON public.brand_subscriptions
  FOR SELECT
  TO authenticated
  USING (brand_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER brand_subscriptions_updated_at
  BEFORE UPDATE ON public.brand_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX brand_subscriptions_customer_idx
  ON public.brand_subscriptions (stripe_customer_id);

-- Helper mirroring has_active_pro_subscription / has_active_consumer_subscription
CREATE OR REPLACE FUNCTION public.has_active_brand_subscription(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_access_restricted(_user)
    AND (
      public.has_role(_user, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.brand_subscriptions
        WHERE brand_user_id = _user
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$$;
