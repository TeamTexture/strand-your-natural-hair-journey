ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS style_name text,
  ADD COLUMN IF NOT EXISTS style_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress';

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('in_progress','complete'));

CREATE TABLE IF NOT EXISTS public.journal_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  note text,
  voice_path text,
  voice_transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, step_order)
);
CREATE INDEX IF NOT EXISTS journal_steps_entry_idx ON public.journal_steps(entry_id, step_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_steps TO authenticated;
GRANT ALL ON public.journal_steps TO service_role;
ALTER TABLE public.journal_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own journal steps"
ON public.journal_steps FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.journal_entries e
  WHERE e.id = journal_steps.entry_id AND e.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.journal_entries e
  WHERE e.id = journal_steps.entry_id AND e.user_id = auth.uid()
));

CREATE TABLE IF NOT EXISTS public.journal_step_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.journal_steps(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo','video')),
  storage_path text NOT NULL,
  duration_seconds numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_step_media_step_idx ON public.journal_step_media(step_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_step_media TO authenticated;
GRANT ALL ON public.journal_step_media TO service_role;
ALTER TABLE public.journal_step_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own journal step media"
ON public.journal_step_media FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_media.step_id AND e.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_media.step_id AND e.user_id = auth.uid()
));

CREATE TABLE IF NOT EXISTS public.journal_step_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.journal_steps(id) ON DELETE CASCADE,
  user_product_id uuid REFERENCES public.user_products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_step_products_step_idx ON public.journal_step_products(step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_step_products TO authenticated;
GRANT ALL ON public.journal_step_products TO service_role;
ALTER TABLE public.journal_step_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own journal step products"
ON public.journal_step_products FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_products.step_id AND e.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_products.step_id AND e.user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.touch_journal_steps_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_steps_touch ON public.journal_steps;
CREATE TRIGGER journal_steps_touch
BEFORE UPDATE ON public.journal_steps
FOR EACH ROW EXECUTE FUNCTION public.touch_journal_steps_updated_at();

-- Renumber remaining steps contiguously from 1 after a delete.
CREATE OR REPLACE FUNCTION public.renumber_journal_steps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY step_order, created_at) AS rn
    FROM public.journal_steps
    WHERE entry_id = OLD.entry_id
  )
  UPDATE public.journal_steps s
  SET step_order = -o.rn
  FROM ordered o
  WHERE s.id = o.id AND s.step_order <> o.rn;

  UPDATE public.journal_steps
  SET step_order = -step_order
  WHERE entry_id = OLD.entry_id AND step_order < 0;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS journal_steps_renumber ON public.journal_steps;
CREATE TRIGGER journal_steps_renumber
AFTER DELETE ON public.journal_steps
FOR EACH ROW EXECUTE FUNCTION public.renumber_journal_steps();