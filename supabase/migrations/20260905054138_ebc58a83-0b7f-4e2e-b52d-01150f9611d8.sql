CREATE TABLE public.daily_hair_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  entry_at timestamptz NOT NULL DEFAULT now(),
  product_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  voice_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_hair_entries_user_date
  ON public.daily_hair_entries (user_id, entry_date DESC, entry_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_hair_entries TO authenticated;
GRANT ALL ON public.daily_hair_entries TO service_role;

ALTER TABLE public.daily_hair_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own daily hair entries"
  ON public.daily_hair_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_daily_hair_entries_updated_at
BEFORE UPDATE ON public.daily_hair_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bump_user_products_on_daily_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOREACH pid IN ARRAY COALESCE(NEW.product_ids, '{}'::uuid[]) LOOP
      UPDATE public.user_products up
         SET use_count = up.use_count + 1,
             last_used_at = GREATEST(COALESCE(up.last_used_at, NEW.entry_at), NEW.entry_at)
       WHERE up.id = pid AND up.user_id = NEW.user_id;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOREACH pid IN ARRAY COALESCE(OLD.product_ids, '{}'::uuid[]) LOOP
      UPDATE public.user_products up
         SET use_count = GREATEST(up.use_count - 1, 0)
       WHERE up.id = pid AND up.user_id = OLD.user_id;
    END LOOP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_user_products_on_daily_entry() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bump_user_products_on_daily_entry_ins
AFTER INSERT ON public.daily_hair_entries
FOR EACH ROW EXECUTE FUNCTION public.bump_user_products_on_daily_entry();

CREATE TRIGGER trg_bump_user_products_on_daily_entry_del
AFTER DELETE ON public.daily_hair_entries
FOR EACH ROW EXECUTE FUNCTION public.bump_user_products_on_daily_entry();