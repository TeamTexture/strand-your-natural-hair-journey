CREATE TABLE public.device_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  inner_width integer,
  inner_height integer,
  screen_width integer,
  screen_height integer,
  device_pixel_ratio numeric,
  vv_scale numeric,
  pointer_coarse boolean,
  zoomed_out boolean,
  user_agent text,
  snapshot_day date GENERATED ALWAYS AS (((created_at AT TIME ZONE 'UTC'))::date) STORED
);

GRANT INSERT ON public.device_snapshots TO authenticated;
GRANT SELECT ON public.device_snapshots TO authenticated;
GRANT ALL ON public.device_snapshots TO service_role;

ALTER TABLE public.device_snapshots ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX device_snapshots_user_day_uniq ON public.device_snapshots (user_id, snapshot_day);

CREATE POLICY "Members insert their own device snapshot"
ON public.device_snapshots FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read device snapshots"
ON public.device_snapshots FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));