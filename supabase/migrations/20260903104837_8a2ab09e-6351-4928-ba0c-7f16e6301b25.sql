ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS retention_offer_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_offer_claimed_at timestamptz;