ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS trial_save_offer_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_save_offer_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_save_offer_fact text;