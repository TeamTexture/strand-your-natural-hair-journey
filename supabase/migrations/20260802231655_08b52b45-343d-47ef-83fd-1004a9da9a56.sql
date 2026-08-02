CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,
  client_user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body_text text,
  audio_path text,
  transcription_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX idx_reviews_professional ON public.reviews(professional_id, status);
CREATE INDEX idx_reviews_client ON public.reviews(client_user_id);

GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Clients may only review an appointment that is theirs, is logged as
-- completed, and is linked to the professional being reviewed.
CREATE POLICY "Clients create reviews for their own completed appointments"
ON public.reviews FOR INSERT TO authenticated
WITH CHECK (
  client_user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id
      AND a.user_id = auth.uid()
      AND a.linked_pro_user_id = reviews.professional_id
      AND a.status = 'completed'
  )
);

CREATE POLICY "Clients read their own reviews"
ON public.reviews FOR SELECT TO authenticated
USING (client_user_id = auth.uid());

CREATE POLICY "Clients edit their own pending reviews"
ON public.reviews FOR UPDATE TO authenticated
USING (client_user_id = auth.uid() AND status = 'pending')
WITH CHECK (client_user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Professionals read reviews about them"
ON public.reviews FOR SELECT TO authenticated
USING (professional_id = auth.uid());

CREATE POLICY "Professionals decide reviews about them"
ON public.reviews FOR UPDATE TO authenticated
USING (professional_id = auth.uid())
WITH CHECK (professional_id = auth.uid() AND status IN ('approved','denied'));

CREATE POLICY "Anyone reads approved reviews"
ON public.reviews FOR SELECT TO anon, authenticated
USING (status = 'approved');

CREATE POLICY "Admins read all reviews"
ON public.reviews FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stamp decided_at whenever the professional approves or denies.
CREATE OR REPLACE FUNCTION public.reviews_stamp_decided_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','denied') THEN
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_stamp_decided
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.reviews_stamp_decided_at();

-- Notify the professional that a review is waiting for them (Phase 4 builds
-- the moderation screen this links to).
CREATE OR REPLACE FUNCTION public.notify_pro_new_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    NEW.professional_id, 'review_pending', NEW.client_user_id, 'review', NEW.id,
    '/pro/reviews',
    'New review awaiting your approval',
    'A client left you a ' || NEW.rating || '-star review. Approve it to show it on your profile.'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_notify_pro
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.notify_pro_new_review();

-- Voicenote audio in the private review-audio bucket.
CREATE POLICY "Clients upload their own review audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'review-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Clients manage their own review audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'review-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Review audio readable by reviewer, pro, or once approved"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'review-audio'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.audio_path = storage.objects.name
        AND (r.professional_id = auth.uid() OR r.status = 'approved')
    )
  )
);