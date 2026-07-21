-- has_role: only authenticated callers (RLS evaluates as invoker)
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- Trigger-only functions: revoke from everyone; triggers run as table owner regardless.
revoke execute on function public.assign_default_consumer_role() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
