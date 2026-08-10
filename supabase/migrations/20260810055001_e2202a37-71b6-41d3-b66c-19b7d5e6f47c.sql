-- ============ enums ============
CREATE TYPE public.treatment_plan_status AS ENUM ('draft','active','paused','completed','abandoned');
CREATE TYPE public.treatment_cadence AS ENUM ('daily','specific_days','weekly');
CREATE TYPE public.treatment_time_of_day AS ENUM ('morning','evening','both');
CREATE TYPE public.treatment_entry_status AS ENUM ('completed','skipped');
CREATE TYPE public.treatment_media_type AS ENUM ('photo','video','audio');
CREATE TYPE public.treatment_assignment_status AS ENUM ('pending','accepted','declined','revoked');

-- ============ 1. templates ============
CREATE TABLE public.treatment_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  duration_weeks integer NOT NULL DEFAULT 12,
  photo_milestone_weeks integer[] NOT NULL DEFAULT '{}',
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_templates TO authenticated;
GRANT ALL ON public.treatment_plan_templates TO service_role;
ALTER TABLE public.treatment_plan_templates ENABLE ROW LEVEL SECURITY;

-- ============ 2. plans ============
CREATE TABLE public.treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal text,
  start_date date NOT NULL DEFAULT (now()::date),
  end_date date,
  duration_weeks integer NOT NULL DEFAULT 12,
  status public.treatment_plan_status NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_template_id uuid REFERENCES public.treatment_plan_templates(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plans_user_idx ON public.treatment_plans(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated;
GRANT ALL ON public.treatment_plans TO service_role;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

-- ============ 3. products ============
CREATE TABLE public.treatment_plan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  brand text,
  usage_notes text,
  step_order integer NOT NULL DEFAULT 0,
  ingredient_id uuid REFERENCES public.glossary_terms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plan_products_plan_idx ON public.treatment_plan_products(plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_products TO authenticated;
GRANT ALL ON public.treatment_plan_products TO service_role;
ALTER TABLE public.treatment_plan_products ENABLE ROW LEVEL SECURITY;

-- ============ 4. schedule ============
CREATE TABLE public.treatment_plan_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  instructions text,
  cadence public.treatment_cadence NOT NULL DEFAULT 'daily',
  days_of_week integer[],
  time_of_day public.treatment_time_of_day NOT NULL DEFAULT 'evening',
  product_id uuid REFERENCES public.treatment_plan_products(id) ON DELETE SET NULL,
  step_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plan_schedule_plan_idx ON public.treatment_plan_schedule(plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_schedule TO authenticated;
GRANT ALL ON public.treatment_plan_schedule TO service_role;
ALTER TABLE public.treatment_plan_schedule ENABLE ROW LEVEL SECURITY;

-- ============ 5. entries ============
CREATE TABLE public.treatment_plan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.treatment_plan_schedule(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  time_of_day public.treatment_time_of_day NOT NULL DEFAULT 'evening',
  status public.treatment_entry_status NOT NULL DEFAULT 'completed',
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_entries_unique_slot UNIQUE (schedule_id, entry_date, time_of_day)
);
CREATE INDEX treatment_plan_entries_plan_idx ON public.treatment_plan_entries(plan_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_entries TO authenticated;
GRANT ALL ON public.treatment_plan_entries TO service_role;
ALTER TABLE public.treatment_plan_entries ENABLE ROW LEVEL SECURITY;

-- ============ 6. check-ins ============
CREATE TABLE public.treatment_plan_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  written_note text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_checkins_unique_week UNIQUE (plan_id, week_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_checkins TO authenticated;
GRANT ALL ON public.treatment_plan_checkins TO service_role;
ALTER TABLE public.treatment_plan_checkins ENABLE ROW LEVEL SECURITY;

-- ============ 8. milestones (before media, media references it) ============
CREATE TABLE public.treatment_plan_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  label text NOT NULL,
  prompt text,
  completed_at timestamptz,
  media_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_milestones TO authenticated;
GRANT ALL ON public.treatment_plan_milestones TO service_role;
ALTER TABLE public.treatment_plan_milestones ENABLE ROW LEVEL SECURITY;

-- ============ 7. media ============
CREATE TABLE public.treatment_plan_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  checkin_id uuid REFERENCES public.treatment_plan_checkins(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.treatment_plan_milestones(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type public.treatment_media_type NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL,
  duration_seconds numeric,
  caption text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_media_type_rules CHECK (
    (media_type = 'photo' AND mime_type IN ('image/jpeg','image/png','image/webp') AND file_size_bytes <= 10485760)
    OR (media_type = 'audio' AND mime_type IN ('audio/webm','audio/mp4','audio/mpeg') AND file_size_bytes <= 15728640)
    OR (media_type = 'video' AND mime_type = 'video/mp4' AND file_size_bytes <= 52428800)
  )
);
CREATE INDEX treatment_plan_media_plan_idx ON public.treatment_plan_media(plan_id);
-- one video per check-in
CREATE UNIQUE INDEX treatment_plan_media_one_video_per_checkin
  ON public.treatment_plan_media(checkin_id)
  WHERE media_type = 'video' AND checkin_id IS NOT NULL;
ALTER TABLE public.treatment_plan_milestones
  ADD CONSTRAINT treatment_plan_milestones_media_id_fkey
  FOREIGN KEY (media_id) REFERENCES public.treatment_plan_media(id) ON DELETE SET NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_media TO authenticated;
GRANT ALL ON public.treatment_plan_media TO service_role;
ALTER TABLE public.treatment_plan_media ENABLE ROW LEVEL SECURITY;

-- ============ 9. assignments ============
CREATE TABLE public.treatment_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.treatment_plan_templates(id) ON DELETE SET NULL,
  status public.treatment_assignment_status NOT NULL DEFAULT 'pending',
  invited_email text,
  accepted_at timestamptz,
  declined_at timestamptz,
  plan_consent_granted_at timestamptz,
  media_sharing_consent boolean NOT NULL DEFAULT false,
  media_consent_granted_at timestamptz,
  media_consent_revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plan_assignments_plan_idx ON public.treatment_plan_assignments(plan_id, professional_id, status);
CREATE INDEX treatment_plan_assignments_client_idx ON public.treatment_plan_assignments(client_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_assignments TO authenticated;
GRANT ALL ON public.treatment_plan_assignments TO service_role;
ALTER TABLE public.treatment_plan_assignments ENABLE ROW LEVEL SECURITY;

-- ============ 10. check-in comments ============
CREATE TABLE public.treatment_plan_checkin_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.treatment_plan_checkins(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_plan_checkin_comments_checkin_idx ON public.treatment_plan_checkin_comments(checkin_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plan_checkin_comments TO authenticated;
GRANT ALL ON public.treatment_plan_checkin_comments TO service_role;
ALTER TABLE public.treatment_plan_checkin_comments ENABLE ROW LEVEL SECURITY;

-- ============ updated_at triggers ============
CREATE TRIGGER trg_tpt_updated BEFORE UPDATE ON public.treatment_plan_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tp_updated BEFORE UPDATE ON public.treatment_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpp_updated BEFORE UPDATE ON public.treatment_plan_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tps_updated BEFORE UPDATE ON public.treatment_plan_schedule FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpe_updated BEFORE UPDATE ON public.treatment_plan_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpc_updated BEFORE UPDATE ON public.treatment_plan_checkins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpm_updated BEFORE UPDATE ON public.treatment_plan_media FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpms_updated BEFORE UPDATE ON public.treatment_plan_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpa_updated BEFORE UPDATE ON public.treatment_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpcc_updated BEFORE UPDATE ON public.treatment_plan_checkin_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ helper functions (security definer, no recursion) ============
CREATE OR REPLACE FUNCTION public.owns_treatment_plan(_plan_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.treatment_plans p WHERE p.id = _plan_id AND p.user_id = _user)
$$;

-- Plan consent gate: an accepted assignment for this professional on this plan.
CREATE OR REPLACE FUNCTION public.has_accepted_plan_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _pro IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.treatment_plan_assignments a
      WHERE a.plan_id = _plan_id
        AND a.professional_id = _pro
        AND a.status = 'accepted'
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$$;

-- Media consent gate: SEPARATE from plan consent. Requires an accepted assignment
-- AND media_sharing_consent = true AND no revocation stamp.
CREATE OR REPLACE FUNCTION public.has_media_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _pro IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.treatment_plan_assignments a
      WHERE a.plan_id = _plan_id
        AND a.professional_id = _pro
        AND a.status = 'accepted'
        AND a.media_sharing_consent = true
        AND a.media_consent_revoked_at IS NULL
    )
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$$;

CREATE OR REPLACE FUNCTION public.treatment_checkin_plan(_checkin_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.plan_id FROM public.treatment_plan_checkins c WHERE c.id = _checkin_id
$$;

CREATE OR REPLACE FUNCTION public.treatment_checkin_owner(_checkin_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.user_id FROM public.treatment_plan_checkins c WHERE c.id = _checkin_id
$$;

-- Revoking media consent never deletes media: force the stamp and keep the flag false.
CREATE OR REPLACE FUNCTION public.treatment_assignment_consent_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.media_sharing_consent AND NOT COALESCE(OLD.media_sharing_consent, false) THEN
    NEW.media_consent_granted_at := COALESCE(NEW.media_consent_granted_at, now());
    NEW.media_consent_revoked_at := NULL;
  ELSIF COALESCE(OLD.media_sharing_consent, false) AND NOT NEW.media_sharing_consent THEN
    NEW.media_consent_revoked_at := now();
  END IF;
  IF NEW.status = 'accepted' AND COALESCE(OLD.status::text, '') <> 'accepted' THEN
    NEW.accepted_at := COALESCE(NEW.accepted_at, now());
    NEW.plan_consent_granted_at := COALESCE(NEW.plan_consent_granted_at, now());
  ELSIF NEW.status = 'declined' AND COALESCE(OLD.status::text, '') <> 'declined' THEN
    NEW.declined_at := COALESCE(NEW.declined_at, now());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_tpa_consent_stamp BEFORE UPDATE ON public.treatment_plan_assignments
FOR EACH ROW EXECUTE FUNCTION public.treatment_assignment_consent_stamp();

-- ============ RLS: templates ============
CREATE POLICY "Pros manage own templates" ON public.treatment_plan_templates
  FOR ALL TO authenticated
  USING (auth.uid() = professional_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = professional_id OR public.has_role(auth.uid(), 'admin'));
-- Clients may read a template only through an assignment made to them.
CREATE POLICY "Clients read assigned templates" ON public.treatment_plan_templates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plan_assignments a
    WHERE a.template_id = treatment_plan_templates.id AND a.client_user_id = auth.uid()
  ));

-- ============ RLS: plans ============
CREATE POLICY "Clients manage own plans" ON public.treatment_plans
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros read consented plans" ON public.treatment_plans
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(id));

-- ============ RLS: products ============
CREATE POLICY "Clients manage own plan products" ON public.treatment_plan_products
  FOR ALL TO authenticated
  USING (public.owns_treatment_plan(plan_id, auth.uid()))
  WITH CHECK (public.owns_treatment_plan(plan_id, auth.uid()));
CREATE POLICY "Pros read consented plan products" ON public.treatment_plan_products
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(plan_id));

-- ============ RLS: schedule ============
CREATE POLICY "Clients manage own plan schedule" ON public.treatment_plan_schedule
  FOR ALL TO authenticated
  USING (public.owns_treatment_plan(plan_id, auth.uid()))
  WITH CHECK (public.owns_treatment_plan(plan_id, auth.uid()));
CREATE POLICY "Pros read consented plan schedule" ON public.treatment_plan_schedule
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(plan_id));

-- ============ RLS: entries ============
CREATE POLICY "Clients manage own plan entries" ON public.treatment_plan_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros read consented plan entries" ON public.treatment_plan_entries
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(plan_id));

-- ============ RLS: check-ins ============
CREATE POLICY "Clients manage own checkins" ON public.treatment_plan_checkins
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros read consented checkins" ON public.treatment_plan_checkins
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(plan_id));

-- ============ RLS: milestones ============
CREATE POLICY "Clients manage own milestones" ON public.treatment_plan_milestones
  FOR ALL TO authenticated
  USING (public.owns_treatment_plan(plan_id, auth.uid()))
  WITH CHECK (public.owns_treatment_plan(plan_id, auth.uid()));
CREATE POLICY "Pros read consented milestones" ON public.treatment_plan_milestones
  FOR SELECT TO authenticated USING (public.has_accepted_plan_access(plan_id));

-- ============ RLS: media (media consent gate only) ============
CREATE POLICY "Clients manage own plan media" ON public.treatment_plan_media
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros read media only with media consent" ON public.treatment_plan_media
  FOR SELECT TO authenticated USING (public.has_media_access(plan_id));

-- ============ RLS: assignments ============
CREATE POLICY "Pros manage own assignments" ON public.treatment_plan_assignments
  FOR ALL TO authenticated
  USING (auth.uid() = professional_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = professional_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients read own assignments" ON public.treatment_plan_assignments
  FOR SELECT TO authenticated USING (auth.uid() = client_user_id);
-- The client is the only party who can accept/decline and set media sharing consent.
CREATE POLICY "Clients update own assignment consent" ON public.treatment_plan_assignments
  FOR UPDATE TO authenticated
  USING (auth.uid() = client_user_id) WITH CHECK (auth.uid() = client_user_id);

-- ============ RLS: check-in comments ============
CREATE POLICY "Pros manage own checkin comments" ON public.treatment_plan_checkin_comments
  FOR ALL TO authenticated
  USING (
    auth.uid() = professional_id
    AND public.has_accepted_plan_access(public.treatment_checkin_plan(checkin_id))
  )
  WITH CHECK (
    auth.uid() = professional_id
    AND public.has_accepted_plan_access(public.treatment_checkin_plan(checkin_id))
  );
CREATE POLICY "Clients read comments on own checkins" ON public.treatment_plan_checkin_comments
  FOR SELECT TO authenticated
  USING (public.treatment_checkin_owner(checkin_id) = auth.uid());

-- ============ storage policies (bucket created separately) ============
CREATE POLICY "Clients manage own treatment media objects" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'treatment-plan-media' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'treatment-plan-media' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Pros read treatment media with media consent" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'treatment-plan-media'
    AND EXISTS (
      SELECT 1 FROM public.treatment_plan_media m
      WHERE m.storage_path = objects.name
        AND public.has_media_access(m.plan_id)
    )
  );
