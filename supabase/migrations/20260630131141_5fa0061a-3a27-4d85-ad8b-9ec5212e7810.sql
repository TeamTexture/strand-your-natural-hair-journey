
-- =========================
-- 1. user_before_photos
-- =========================
CREATE TABLE public.user_before_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_before_photos TO authenticated;
GRANT ALL ON public.user_before_photos TO service_role;
ALTER TABLE public.user_before_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own before photos" ON public.user_before_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_before_photos_user_idx ON public.user_before_photos(user_id, created_at DESC);

-- =========================
-- 2. user_milestone_photos
-- =========================
CREATE TABLE public.user_milestone_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  taken_on DATE NOT NULL DEFAULT (now()::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_milestone_photos TO authenticated;
GRANT ALL ON public.user_milestone_photos TO service_role;
ALTER TABLE public.user_milestone_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own milestone photos" ON public.user_milestone_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_milestone_photos_user_idx ON public.user_milestone_photos(user_id, taken_on DESC);

-- =========================
-- 3. appointment_photos
-- =========================
CREATE TABLE public.appointment_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_photos TO authenticated;
GRANT ALL ON public.appointment_photos TO service_role;
ALTER TABLE public.appointment_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own appointment photos" ON public.appointment_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX appointment_photos_appt_idx ON public.appointment_photos(appointment_id);

-- =========================
-- 4. hair_strand_summaries
-- =========================
CREATE TABLE public.hair_strand_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overview TEXT NOT NULL,
  action_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  routine_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hair_strand_summaries TO authenticated;
GRANT ALL ON public.hair_strand_summaries TO service_role;
ALTER TABLE public.hair_strand_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own strand summaries" ON public.hair_strand_summaries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX hair_strand_summaries_user_idx ON public.hair_strand_summaries(user_id, created_at DESC);

-- =========================
-- 5. Storage policies: per-user folders in the 3 new buckets.
--    Path convention: <user_id>/<filename>
-- =========================
CREATE POLICY "before-photos: read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'before-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "before-photos: write own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'before-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "before-photos: update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'before-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "before-photos: delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'before-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "milestone-photos: read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "milestone-photos: write own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "milestone-photos: update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "milestone-photos: delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "appointment-photos: read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'appointment-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "appointment-photos: write own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'appointment-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "appointment-photos: update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'appointment-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "appointment-photos: delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'appointment-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
