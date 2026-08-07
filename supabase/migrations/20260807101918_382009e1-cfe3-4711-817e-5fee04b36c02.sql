CREATE OR REPLACE FUNCTION public.ad_audience_floor()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 0 $$;

CREATE OR REPLACE FUNCTION public.brand_count_min_threshold()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 0 $$;