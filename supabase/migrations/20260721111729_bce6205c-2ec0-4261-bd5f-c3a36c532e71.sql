
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  source text
);

CREATE INDEX user_sessions_user_started_idx
  ON public.user_sessions (user_id, started_at DESC);

GRANT INSERT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own sessions"
  ON public.user_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all sessions"
  ON public.user_sessions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Server-side debounce: ignore a new row if the user's latest session is < 1 hour old.
CREATE OR REPLACE FUNCTION public.debounce_user_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = NEW.user_id
      AND started_at > now() - interval '1 hour'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_sessions_debounce
  BEFORE INSERT ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.debounce_user_session();

-- Admin-only aggregate for the members list.
CREATE OR REPLACE FUNCTION public.admin_list_member_activity()
RETURNS TABLE(
  user_id uuid,
  session_count bigint,
  last_session timestamptz,
  sessions_last_30d bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read member activity';
  END IF;
  RETURN QUERY
    SELECT
      s.user_id,
      COUNT(*)::bigint AS session_count,
      MAX(s.started_at) AS last_session,
      COUNT(*) FILTER (WHERE s.started_at > now() - interval '30 days')::bigint AS sessions_last_30d
    FROM public.user_sessions s
    GROUP BY s.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_member_activity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_member_activity() TO authenticated;
