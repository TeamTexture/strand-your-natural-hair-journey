CREATE TABLE public.alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  trigger_signature text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_key, trigger_signature)
);

CREATE INDEX alert_dismissals_user_idx ON public.alert_dismissals (user_id);

GRANT SELECT, INSERT, DELETE ON public.alert_dismissals TO authenticated;
GRANT ALL ON public.alert_dismissals TO service_role;

ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own alert dismissals"
  ON public.alert_dismissals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members insert own alert dismissals"
  ON public.alert_dismissals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members delete own alert dismissals"
  ON public.alert_dismissals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);