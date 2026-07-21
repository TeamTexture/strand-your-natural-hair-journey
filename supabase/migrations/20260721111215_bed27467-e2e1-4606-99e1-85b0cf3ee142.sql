-- Additive admin SELECT policies on passport tables. Existing consumer/pro
-- policies remain untouched. Idempotent.
DO $$
DECLARE
  policy_name text := 'Admins can read passport';
  tables text[] := ARRAY[
    'profiles',
    'blood_results',
    'blood_panels',
    'ai_summaries',
    'hair_strand_summaries',
    'user_hair_profile',
    'user_health_profile',
    'user_style_profile',
    'wash_days',
    'journal_entries',
    'user_goals',
    'goal_updates',
    'user_products',
    'user_product_photos',
    'product_ratings',
    'product_voicenotes',
    'appointments',
    'appointment_photos',
    'user_medications',
    'user_tools',
    'user_milestone_photos',
    'user_before_photos',
    'user_saved_meals'
  ];
  tname text;
BEGIN
  FOREACH tname IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tname AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.has_role(auth.uid(), ''admin''::app_role)
         )',
        policy_name, tname
      );
    END IF;
  END LOOP;
END $$;

-- Allow admins to write their own passport view rows (audit trail).
-- Service_role already bypasses RLS, so the edge function keeps working;
-- this policy is a belt-and-braces layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pro_passport_views'
      AND policyname = 'Admins can insert passport views'
  ) THEN
    CREATE POLICY "Admins can insert passport views"
      ON public.pro_passport_views FOR INSERT
      TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND pro_user_id = auth.uid());
  END IF;
END $$;
