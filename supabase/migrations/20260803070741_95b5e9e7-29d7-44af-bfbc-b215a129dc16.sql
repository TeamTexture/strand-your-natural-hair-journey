-- 1. Remove the broad public read (leaked client_user_id) — public access is via RPCs below.
DROP POLICY IF EXISTS "Anyone reads approved reviews" ON public.reviews;

-- 2. Aggregate ratings for directory cards / profile header.
CREATE OR REPLACE FUNCTION public.pro_review_summary(_pro_ids uuid[])
RETURNS TABLE(professional_id uuid, avg_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.professional_id,
         ROUND(AVG(r.rating)::numeric, 1) AS avg_rating,
         COUNT(*)::bigint AS review_count
  FROM public.reviews r
  WHERE r.status = 'approved'
    AND (_pro_ids IS NULL OR r.professional_id = ANY(_pro_ids))
  GROUP BY r.professional_id
$$;

-- 3. Public, PII-safe review list (first name + last initial only).
CREATE OR REPLACE FUNCTION public.pro_public_reviews(_pro uuid, _limit integer DEFAULT 10, _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  rating integer,
  body_text text,
  audio_path text,
  transcription_text text,
  created_at timestamptz,
  reviewer_label text,
  service text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.rating,
    r.body_text,
    r.audio_path,
    r.transcription_text,
    r.created_at,
    COALESCE(
      NULLIF(
        trim(
          split_part(COALESCE(p.display_name, ''), ' ', 1)
          || CASE
               WHEN split_part(COALESCE(p.display_name, ''), ' ', 2) <> ''
                 THEN ' ' || upper(left(split_part(p.display_name, ' ', 2), 1)) || '.'
               ELSE ''
             END
        ),
        ''
      ),
      'STRAND member'
    ) AS reviewer_label,
    NULLIF(trim(COALESCE(a.service, '')), '') AS service
  FROM public.reviews r
  LEFT JOIN public.profiles p ON p.user_id = r.client_user_id
  LEFT JOIN public.appointments a ON a.id = r.appointment_id
  WHERE r.professional_id = _pro
    AND r.status = 'approved'
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
$$;

REVOKE ALL ON FUNCTION public.pro_review_summary(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pro_public_reviews(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pro_review_summary(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_public_reviews(uuid, integer, integer) TO anon, authenticated;

-- 4. Notify the client when their review is published or declined.
CREATE OR REPLACE FUNCTION public.notify_client_review_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pro text;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('approved','denied') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pp.display_name, 'Your professional') INTO v_pro
  FROM public.pro_profiles pp WHERE pp.user_id = NEW.professional_id;

  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    NEW.client_user_id,
    CASE WHEN NEW.status = 'approved' THEN 'review_approved' ELSE 'review_denied' END,
    NEW.professional_id,
    'review',
    NEW.id,
    '/appointments',
    CASE WHEN NEW.status = 'approved' THEN 'Your review is live' ELSE 'Your review was not published' END,
    CASE WHEN NEW.status = 'approved'
      THEN COALESCE(v_pro, 'Your professional') || ' published your review on their listing.'
      ELSE COALESCE(v_pro, 'Your professional') || ' chose not to publish your review. It stays visible to you both.'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_notify_client_decision ON public.reviews;
CREATE TRIGGER reviews_notify_client_decision
AFTER UPDATE OF status ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.notify_client_review_decision();