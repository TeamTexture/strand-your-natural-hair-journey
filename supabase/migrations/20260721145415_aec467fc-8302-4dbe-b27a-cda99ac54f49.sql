
CREATE TABLE public.pro_client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pro_client_notes_pro_consumer
  ON public.pro_client_notes (pro_user_id, consumer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_client_notes TO authenticated;
GRANT ALL ON public.pro_client_notes TO service_role;

ALTER TABLE public.pro_client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pros read only their own notes"
  ON public.pro_client_notes FOR SELECT
  USING (auth.uid() = pro_user_id);

CREATE POLICY "Pros insert only their own notes"
  ON public.pro_client_notes FOR INSERT
  WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "Pros update only their own notes"
  ON public.pro_client_notes FOR UPDATE
  USING (auth.uid() = pro_user_id)
  WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "Pros delete only their own notes"
  ON public.pro_client_notes FOR DELETE
  USING (auth.uid() = pro_user_id);

CREATE TRIGGER trg_pro_client_notes_updated_at
  BEFORE UPDATE ON public.pro_client_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
