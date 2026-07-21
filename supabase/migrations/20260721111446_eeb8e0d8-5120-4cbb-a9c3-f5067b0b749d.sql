CREATE OR REPLACE FUNCTION public.admin_list_member_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read member emails';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_member_emails() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_member_emails() TO authenticated;