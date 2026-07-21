
-- consumer_subscriptions (mirrors pro_subscriptions)
CREATE TABLE public.consumer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  price_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consumer_subscriptions TO authenticated;
GRANT ALL ON public.consumer_subscriptions TO service_role;

ALTER TABLE public.consumer_subscriptions ENABLE ROW LEVEL SECURITY;

-- Consumer can read own subscription
CREATE POLICY "Consumer reads own subscription"
  ON public.consumer_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admin can read all subscriptions
CREATE POLICY "Admin reads all consumer subscriptions"
  ON public.consumer_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies — service role only (webhook).

CREATE TRIGGER consumer_subs_updated_at
  BEFORE UPDATE ON public.consumer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- complimentary_access on profiles (admin-settable only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS complimentary_access boolean NOT NULL DEFAULT false;

-- Grandfather existing accounts — every profile that already exists gets free access.
UPDATE public.profiles SET complimentary_access = true;

-- Prevent non-admins from toggling complimentary_access.
CREATE OR REPLACE FUNCTION public.enforce_complimentary_access_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.complimentary_access IS DISTINCT FROM OLD.complimentary_access
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change complimentary_access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_complimentary_guard ON public.profiles;
CREATE TRIGGER profiles_complimentary_guard
  BEFORE UPDATE OF complimentary_access ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complimentary_access_admin_only();

-- Allow admins to update any profile (needed to toggle the flag)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Admins can update any profile'
  ) THEN
    CREATE POLICY "Admins can update any profile"
      ON public.profiles
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Admins can read all profiles'
  ) THEN
    CREATE POLICY "Admins can read all profiles"
      ON public.profiles
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- has_active_consumer_subscription helper
-- True if: complimentary_access, OR admin/professional role, OR active stripe sub.
CREATE OR REPLACE FUNCTION public.has_active_consumer_subscription(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT complimentary_access FROM public.profiles WHERE user_id = _user), false)
    OR public.has_role(_user, 'admin')
    OR public.has_role(_user, 'professional')
    OR EXISTS (
      SELECT 1 FROM public.consumer_subscriptions
      WHERE user_id = _user
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
$$;

-- Platform settings: consumer price + stripe price id
INSERT INTO public.platform_settings (key, value)
VALUES
  ('consumer_monthly_price_gbp', to_jsonb(9.99)),
  ('stripe_consumer_price_id', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;
