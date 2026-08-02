CREATE TABLE public.user_advice_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  surface text NOT NULL,
  action_key text NOT NULL,
  headline text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_advice_ledger_unique ON public.user_advice_ledger (user_id, surface, action_key);
CREATE INDEX user_advice_ledger_recent ON public.user_advice_ledger (user_id, created_at DESC);

GRANT SELECT ON public.user_advice_ledger TO authenticated;
GRANT ALL ON public.user_advice_ledger TO service_role;

ALTER TABLE public.user_advice_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own advice ledger"
ON public.user_advice_ledger
FOR SELECT
TO authenticated
USING (user_id = auth.uid());