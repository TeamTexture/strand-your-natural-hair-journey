ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS application_area text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS leave_on boolean,
  ADD COLUMN IF NOT EXISTS usage_instructions text;

ALTER TABLE public.user_products
  DROP CONSTRAINT IF EXISTS user_products_application_area_check;

ALTER TABLE public.user_products
  ADD CONSTRAINT user_products_application_area_check
  CHECK (application_area = ANY (ARRAY['scalp'::text,'lengths_ends'::text,'scalp_and_lengths'::text,'rinse_out'::text,'unknown'::text]));