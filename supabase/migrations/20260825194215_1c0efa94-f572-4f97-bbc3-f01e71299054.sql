REVOKE EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_onboarding(uuid) TO service_role;