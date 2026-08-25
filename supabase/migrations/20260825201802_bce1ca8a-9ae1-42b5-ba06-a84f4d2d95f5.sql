REVOKE EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_consumer_avatar(text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_consumer_avatar(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_consumer_avatar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_consumer_avatar(text) TO service_role;