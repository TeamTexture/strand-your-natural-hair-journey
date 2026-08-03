CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  read_by uuid
);

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications (created_at DESC) WHERE read_at IS NULL;
CREATE INDEX admin_notifications_entity_idx ON public.admin_notifications (entity_type, entity_id);
CREATE UNIQUE INDEX admin_notifications_dedupe_idx ON public.admin_notifications (type, entity_id) WHERE entity_id IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- Central emitter
CREATE OR REPLACE FUNCTION public.notify_admins(
  _type text, _title text, _body text,
  _entity_type text, _entity_id uuid, _url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url)
  VALUES (_type, _title, _body, _entity_type, _entity_id, _url)
  ON CONFLICT (type, entity_id) WHERE entity_id IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title,
                body = EXCLUDED.body,
                url = EXCLUDED.url,
                created_at = now(),
                read_at = NULL,
                read_by = NULL;
END; $$;

REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, uuid, text) TO service_role;

-- Mark read helpers
CREATE OR REPLACE FUNCTION public.admin_notifications_mark_read(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update admin notifications';
  END IF;
  UPDATE public.admin_notifications
    SET read_at = now(), read_by = auth.uid()
  WHERE read_at IS NULL AND (_ids IS NULL OR id = ANY(_ids));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_notifications_mark_entity_read(_entity_type text, _entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update admin notifications';
  END IF;
  UPDATE public.admin_notifications
    SET read_at = now(), read_by = auth.uid()
  WHERE read_at IS NULL
    AND entity_type = _entity_type
    AND entity_id = _entity_id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_notifications_mark_read(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_notifications_mark_entity_read(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_notifications_mark_read(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_notifications_mark_entity_read(text, uuid) TO authenticated, service_role;

-- 1. Professional applications (paid + pending)
CREATE OR REPLACE FUNCTION public.admin_notify_pro_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_confirmed_at IS NULL OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_confirmed_at IS NOT NULL AND OLD.status = 'pending' THEN RETURN NEW; END IF;
  PERFORM public.notify_admins(
    'pro_application',
    'New professional request',
    COALESCE(NEW.full_name, 'A professional') || ' applied to join the directory.',
    'pro_application', NEW.id, '/admin/applications'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_pro_application
AFTER INSERT OR UPDATE ON public.pro_applications
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_pro_application();

-- 2. Professional profile edits awaiting re-approval
CREATE OR REPLACE FUNCTION public.admin_notify_pro_profile_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.profile_review_status = 'submitted'
     AND (TG_OP = 'INSERT' OR OLD.profile_review_status IS DISTINCT FROM 'submitted') THEN
    PERFORM public.notify_admins(
      'pro_profile_review',
      'Profile edits to review',
      COALESCE(NEW.display_name, 'A professional') || ' submitted profile changes for approval.',
      'pro_profile', NEW.user_id, '/admin/pro-reviews'
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_pro_profile_review
AFTER INSERT OR UPDATE ON public.pro_profiles
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_pro_profile_review();

-- 3. New brand account
CREATE OR REPLACE FUNCTION public.admin_notify_brand_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'brand_profile',
    'New brand account',
    COALESCE(NEW.brand_name, 'A brand') || ' created a brand account.',
    'brand_profile', NEW.user_id, '/admin/brands'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_brand_profile
AFTER INSERT ON public.brand_profiles
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_brand_profile();

-- 4. Campaign submitted for review
CREATE OR REPLACE FUNCTION public.admin_notify_brand_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'under_review'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'under_review') THEN
    PERFORM public.notify_admins(
      'brand_offer',
      'Campaign awaiting review',
      COALESCE(NULLIF(NEW.headline, ''), 'A campaign') || ' was submitted for review.',
      'brand_offer', NEW.id, '/admin/brand-offers?filter=pending'
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_brand_offer
AFTER INSERT OR UPDATE ON public.brand_offers
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_brand_offer();

-- 5. Campaign edit submitted
CREATE OR REPLACE FUNCTION public.admin_notify_brand_offer_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.notify_admins(
      'brand_offer_revision',
      'Campaign edit to review',
      'A brand submitted changes to a live campaign.',
      'brand_offer_revision', NEW.id, '/admin/brand-offers/' || NEW.offer_id || '/review'
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_brand_offer_revision
AFTER INSERT ON public.brand_offer_revisions
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_brand_offer_revision();

-- 6. Flagged forum content
CREATE OR REPLACE FUNCTION public.admin_notify_forum_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'forum_report',
    'Content reported',
    'A member reported a ' || COALESCE(NEW.target_kind, 'post') || '.',
    'forum_report', NEW.id, '/admin/moderation'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_forum_report
AFTER INSERT ON public.forum_reports
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_forum_report();

-- 7. Contact messages
CREATE OR REPLACE FUNCTION public.admin_notify_contact_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'contact_message',
    'New message',
    COALESCE(NULLIF(NEW.name, ''), 'Someone') || ' sent a message.',
    'contact_message', NEW.id, '/admin/messages'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_admin_notify_contact_message
AFTER INSERT ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_contact_message();

-- BACKFILL current queues
INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url, created_at)
SELECT 'pro_application', 'New professional request',
       COALESCE(a.full_name, 'A professional') || ' applied to join the directory.',
       'pro_application', a.id, '/admin/applications', a.created_at
FROM public.pro_applications a
WHERE a.status = 'pending' AND a.payment_confirmed_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url, created_at)
SELECT 'pro_profile_review', 'Profile edits to review',
       COALESCE(p.display_name, 'A professional') || ' submitted profile changes for approval.',
       'pro_profile', p.user_id, '/admin/pro-reviews', p.updated_at
FROM public.pro_profiles p
WHERE p.profile_review_status = 'submitted'
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url, created_at)
SELECT 'brand_offer', 'Campaign awaiting review',
       COALESCE(NULLIF(o.headline, ''), 'A campaign') || ' was submitted for review.',
       'brand_offer', o.id, '/admin/brand-offers?filter=pending', o.created_at
FROM public.brand_offers o
WHERE o.status = 'under_review'
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url, created_at)
SELECT 'brand_offer_revision', 'Campaign edit to review',
       'A brand submitted changes to a live campaign.',
       'brand_offer_revision', r.id, '/admin/brand-offers/' || r.offer_id || '/review', r.created_at
FROM public.brand_offer_revisions r
WHERE r.status = 'pending'
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_notifications (type, title, body, entity_type, entity_id, url, created_at)
SELECT 'forum_report', 'Content reported',
       'A member reported a ' || COALESCE(fr.target_kind, 'post') || '.',
       'forum_report', fr.id, '/admin/moderation', fr.created_at
FROM public.forum_reports fr
WHERE fr.status = 'open'
ON CONFLICT DO NOTHING;