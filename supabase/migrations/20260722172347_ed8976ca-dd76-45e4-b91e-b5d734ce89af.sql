
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  url text,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;

-- Resolve @labels to user_ids across members, pros and brands.
CREATE OR REPLACE FUNCTION public.resolve_mention_user_ids(_text text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  label text;
  ids uuid[] := ARRAY[]::uuid[];
  uid uuid;
BEGIN
  IF _text IS NULL OR _text = '' THEN RETURN ids; END IF;
  FOR m IN
    SELECT DISTINCT lower(trim(match[1])) AS label
    FROM regexp_matches(_text, '@([A-Za-z0-9_][A-Za-z0-9_ .''\-]{0,60}?)(?=[\s.,!?;:\)]|$)', 'g') AS match
  LOOP
    label := m.label;
    IF label IS NULL OR label = '' OR label = 'everyone' THEN CONTINUE; END IF;

    SELECT p.user_id INTO uid FROM public.profiles p
      WHERE lower(trim(p.display_name)) = label LIMIT 1;
    IF uid IS NULL THEN
      SELECT pp.user_id INTO uid FROM public.pro_profiles pp
        WHERE lower(trim(pp.display_name)) = label LIMIT 1;
    END IF;
    IF uid IS NULL THEN
      SELECT bp.user_id INTO uid FROM public.brand_profiles bp
        WHERE lower(trim(bp.brand_name)) = label LIMIT 1;
    END IF;

    IF uid IS NOT NULL AND NOT (uid = ANY(ids)) THEN
      ids := array_append(ids, uid);
    END IF;
    uid := NULL;
  END LOOP;
  RETURN ids;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_mention_user_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_mention_user_ids(text) TO authenticated, service_role;

-- Forum threads
CREATE OR REPLACE FUNCTION public.notify_mentions_forum_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; uid uuid;
BEGIN
  ids := public.resolve_mention_user_ids(coalesce(NEW.title,'') || ' ' || coalesce(NEW.body,''));
  IF ids IS NULL THEN RETURN NEW; END IF;
  FOREACH uid IN ARRAY ids LOOP
    IF uid <> NEW.author_id THEN
      INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
      VALUES (uid, 'mention', NEW.author_id, 'forum_thread', NEW.id,
              '/forum/' || NEW.id::text,
              'You were tagged in a thread',
              left(coalesce(NEW.title, ''), 140));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_mentions_forum_thread
  AFTER INSERT ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions_forum_thread();

-- Forum replies
CREATE OR REPLACE FUNCTION public.notify_mentions_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; uid uuid;
BEGIN
  ids := public.resolve_mention_user_ids(coalesce(NEW.body,''));
  IF ids IS NULL THEN RETURN NEW; END IF;
  FOREACH uid IN ARRAY ids LOOP
    IF uid <> NEW.author_id THEN
      INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
      VALUES (uid, 'mention', NEW.author_id, 'forum_reply', NEW.id,
              '/forum/' || NEW.thread_id::text,
              'You were tagged in a reply',
              left(coalesce(NEW.body, ''), 140));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_mentions_forum_reply
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions_forum_reply();

-- Chat messages
CREATE OR REPLACE FUNCTION public.notify_mentions_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; uid uuid;
BEGIN
  IF NEW.sender_id IS NULL OR NEW.kind = 'system' THEN RETURN NEW; END IF;
  ids := public.resolve_mention_user_ids(coalesce(NEW.body,''));
  IF ids IS NULL THEN RETURN NEW; END IF;
  FOREACH uid IN ARRAY ids LOOP
    IF uid <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
      VALUES (uid, 'mention', NEW.sender_id, 'chat_message', NEW.id,
              '/messages/' || NEW.thread_id::text,
              'You were tagged in a message',
              left(coalesce(NEW.body, ''), 140));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_mentions_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions_chat_message();

-- Library items (title + body)
CREATE OR REPLACE FUNCTION public.notify_mentions_content_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; uid uuid; combined text;
BEGIN
  combined := coalesce(NEW.title,'') || ' ' || coalesce(NEW.body_md,'');
  IF TG_OP = 'UPDATE' AND coalesce(OLD.title,'') || ' ' || coalesce(OLD.body_md,'') = combined THEN
    RETURN NEW;
  END IF;
  ids := public.resolve_mention_user_ids(combined);
  IF ids IS NULL THEN RETURN NEW; END IF;
  FOREACH uid IN ARRAY ids LOOP
    INSERT INTO public.notifications (user_id, kind, entity_type, entity_id, url, title, body)
    VALUES (uid, 'mention', 'library_item', NEW.id,
            '/plus/library/' || NEW.collection_id::text,
            'You were tagged in the Library',
            left(coalesce(NEW.title, ''), 140));
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_mentions_content_item
  AFTER INSERT OR UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions_content_item();

-- Library collections (title + description)
CREATE OR REPLACE FUNCTION public.notify_mentions_content_collection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; uid uuid; combined text;
BEGIN
  combined := coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'');
  IF TG_OP = 'UPDATE' AND coalesce(OLD.title,'') || ' ' || coalesce(OLD.description,'') = combined THEN
    RETURN NEW;
  END IF;
  ids := public.resolve_mention_user_ids(combined);
  IF ids IS NULL THEN RETURN NEW; END IF;
  FOREACH uid IN ARRAY ids LOOP
    INSERT INTO public.notifications (user_id, kind, entity_type, entity_id, url, title, body)
    VALUES (uid, 'mention', 'library_collection', NEW.id,
            '/plus/library',
            'You were tagged in the Library',
            left(coalesce(NEW.title, ''), 140));
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_mentions_content_collection
  AFTER INSERT OR UPDATE ON public.content_collections
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions_content_collection();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
