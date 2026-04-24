CREATE TABLE public.user_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tool_key text NOT NULL,
  name text NOT NULL,
  brand text,
  category text,
  storage_path text,
  image_url text,
  rating smallint,
  notes text,
  on_shelf boolean NOT NULL DEFAULT true,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, tool_key)
);

ALTER TABLE public.user_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tools"
  ON public.user_tools FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own tools"
  ON public.user_tools FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tools"
  ON public.user_tools FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own tools"
  ON public.user_tools FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_tools_updated_at
  BEFORE UPDATE ON public.user_tools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_tools_user ON public.user_tools(user_id);

-- Reuse the existing product-photos bucket for tool images. Storage policies on
-- that bucket already restrict access by user, so no new policies are needed.
