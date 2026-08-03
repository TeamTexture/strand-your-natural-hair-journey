REVOKE EXECUTE ON FUNCTION public.admin_set_account_type(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_role_history(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.account_type_of(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_account_type(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_role_history(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_type_of(uuid) TO authenticated, service_role;