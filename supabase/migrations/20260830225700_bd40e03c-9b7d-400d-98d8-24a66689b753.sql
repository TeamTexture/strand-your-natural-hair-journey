CREATE TABLE IF NOT EXISTS public.admin_account_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'requested',
  performed_by uuid,
  erase_on timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_account_deletion_log TO authenticated;
GRANT ALL ON public.admin_account_deletion_log TO service_role;

ALTER TABLE public.admin_account_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin account deletion log"
  ON public.admin_account_deletion_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_account_deletion_log_user_idx
  ON public.admin_account_deletion_log (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_account_deletion_history(_user_id uuid)
RETURNS TABLE(id uuid, action text, performed_by uuid, performed_by_name text, erase_on timestamptz, reason text, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT l.id, l.action, l.performed_by, p.display_name, l.erase_on, l.reason, l.created_at
  FROM public.admin_account_deletion_log l
  LEFT JOIN public.profiles p ON p.user_id = l.performed_by
  WHERE l.user_id = _user_id
  ORDER BY l.created_at DESC;
END;
$$;