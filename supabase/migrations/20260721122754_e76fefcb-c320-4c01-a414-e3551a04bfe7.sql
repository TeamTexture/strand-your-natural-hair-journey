DO $$
DECLARE
  pro_policy text := 'Pros with active consent can read passport';
  admin_policy text := 'Admins can read passport';
  tables text[] := ARRAY['moodboards','moodboard_images','ingredient_lists'];
  tname text;
BEGIN
  FOREACH tname IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tname AND policyname=pro_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.has_role(auth.uid(), ''professional'')
           AND public.has_active_pro_subscription(auth.uid())
           AND public.has_active_client_access(auth.uid(), user_id)
         )', pro_policy, tname);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tname AND policyname=admin_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.has_role(auth.uid(), ''admin''::app_role)
         )', admin_policy, tname);
    END IF;
  END LOOP;
END $$;