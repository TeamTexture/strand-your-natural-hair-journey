ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS brand_colour_primary text,
  ADD COLUMN IF NOT EXISTS brand_colour_secondary text,
  ADD COLUMN IF NOT EXISTS brand_colour_on_primary text,
  ADD COLUMN IF NOT EXISTS brand_colour_source text,
  ADD COLUMN IF NOT EXISTS brand_colour_updated_at timestamptz;

ALTER TABLE public.ad_events DROP CONSTRAINT IF EXISTS ad_events_event_type_check;
ALTER TABLE public.ad_events ADD CONSTRAINT ad_events_event_type_check
  CHECK (event_type = ANY (ARRAY['view'::text,'expand'::text,'link_click'::text,'code_copy'::text,'wishlist'::text,'shelf_add'::text]));