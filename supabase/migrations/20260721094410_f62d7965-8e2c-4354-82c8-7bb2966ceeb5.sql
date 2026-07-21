
-- 0. Role backfill for founder account (idempotent)
DO $$
DECLARE paige_id uuid;
BEGIN
  SELECT id INTO paige_id FROM auth.users WHERE email = 'paige.lewin@gmail.com' LIMIT 1;
  IF paige_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (paige_id, 'professional')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (paige_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.pro_profiles (user_id, display_name, discipline, is_published)
    VALUES (
      paige_id,
      COALESCE((SELECT display_name FROM public.profiles WHERE user_id = paige_id), 'Paige Lewin'),
      'Trichologist',
      false
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- 1. Passport audit log
CREATE TABLE IF NOT EXISTS public.pro_passport_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL,
  consumer_id uuid NOT NULL,
  section text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_passport_views_pro_idx ON public.pro_passport_views (pro_user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS pro_passport_views_consumer_idx ON public.pro_passport_views (consumer_id, viewed_at DESC);

GRANT SELECT ON public.pro_passport_views TO authenticated;
GRANT ALL ON public.pro_passport_views TO service_role;

ALTER TABLE public.pro_passport_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consumers read own passport view log"
  ON public.pro_passport_views FOR SELECT
  TO authenticated
  USING (consumer_id = auth.uid());

CREATE POLICY "Admins read all passport views"
  ON public.pro_passport_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT / UPDATE / DELETE policies for authenticated: only service_role writes.

-- 2. Additive passport SELECT policies. Every policy uses the same predicate:
--    the viewer must be a professional with an active subscription AND hold
--    active client-access consent for the row's owner. Existing consumer
--    policies remain untouched.

DO $$
DECLARE
  t record;
  policy_name text := 'Pros with active consent can read passport';
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
    -- Skip if policy already exists (idempotent)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tname AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
           public.has_role(auth.uid(), ''professional'')
           AND public.has_active_pro_subscription(auth.uid())
           AND public.has_active_client_access(auth.uid(), user_id)
         )',
        policy_name, tname
      );
    END IF;
  END LOOP;
END $$;
