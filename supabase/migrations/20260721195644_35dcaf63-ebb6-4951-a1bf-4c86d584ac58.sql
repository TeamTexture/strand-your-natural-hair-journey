
ALTER TABLE public.pro_enquiries
  ADD COLUMN IF NOT EXISTS service_interest text,
  ADD COLUMN IF NOT EXISTS preferred_timeframe text,
  ADD COLUMN IF NOT EXISTS contact_method text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS location_preference text,
  ADD COLUMN IF NOT EXISTS budget_range text;
