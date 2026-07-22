
-- ============ 1. TIER + PLUS ACCESS ============
ALTER TABLE public.consumer_subscriptions
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('standard', 'plus'));

CREATE OR REPLACE FUNCTION public.has_active_plus_subscription(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _user IS NOT NULL
    AND NOT public.is_access_restricted(_user)
    AND (
      public.has_role(_user, 'admin')
      OR COALESCE((SELECT complimentary_access FROM public.profiles WHERE user_id = _user), false)
      OR EXISTS (
        SELECT 1 FROM public.consumer_subscriptions
        WHERE user_id = _user AND tier = 'plus'
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$$;

-- ============ 2. FORUM ============
CREATE TABLE IF NOT EXISTS public.forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_categories TO authenticated;
GRANT ALL ON public.forum_categories TO service_role;
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read categories" ON public.forum_categories
  FOR SELECT TO authenticated USING (public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Admins manage categories" ON public.forum_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.forum_categories (name, slug, sort_order) VALUES
  ('General', 'general', 10),
  ('Wash Day Talk', 'wash-day', 20),
  ('Products & Reviews', 'products', 30),
  ('Styling & Length', 'styling', 40),
  ('Scalp & Health', 'scalp-health', 50),
  ('Ask The Community', 'ask', 60)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.forum_categories(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  image_path text,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  vote_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_threads_category_idx ON public.forum_threads(category_id, is_pinned DESC, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read threads" ON public.forum_threads FOR SELECT TO authenticated USING (public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus members create own threads" ON public.forum_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.has_active_plus_subscription(auth.uid()) AND NOT public.is_access_restricted(auth.uid()));
CREATE POLICY "Author or admin edit thread" ON public.forum_threads FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin delete thread" ON public.forum_threads FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER forum_threads_updated BEFORE UPDATE ON public.forum_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  parent_reply_id uuid REFERENCES public.forum_replies(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_replies_thread_idx ON public.forum_replies(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_replies TO authenticated;
GRANT ALL ON public.forum_replies TO service_role;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read replies" ON public.forum_replies FOR SELECT TO authenticated USING (public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Plus members create own replies" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id AND public.has_active_plus_subscription(auth.uid()) AND NOT public.is_access_restricted(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.forum_threads t WHERE t.id = thread_id AND t.is_locked = true AND NOT public.has_role(auth.uid(),'admin'))
  );
CREATE POLICY "Author or admin edit reply" ON public.forum_replies FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin delete reply" ON public.forum_replies FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER forum_replies_updated BEFORE UPDATE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.forum_bump_reply_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.thread_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER forum_reply_count_ins AFTER INSERT ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION public.forum_bump_reply_count();
CREATE TRIGGER forum_reply_count_del AFTER DELETE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION public.forum_bump_reply_count();

CREATE TABLE IF NOT EXISTS public.forum_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('thread','reply')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS forum_votes_target_idx ON public.forum_votes(target_kind, target_id);
GRANT SELECT, INSERT, DELETE ON public.forum_votes TO authenticated;
GRANT ALL ON public.forum_votes TO service_role;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read own votes" ON public.forum_votes FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Plus members cast own votes" ON public.forum_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()) AND NOT public.is_access_restricted(auth.uid()));
CREATE POLICY "Plus members remove own votes" ON public.forum_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.forum_bump_vote_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tgt_kind text := COALESCE(NEW.target_kind, OLD.target_kind);
  tgt_id uuid := COALESCE(NEW.target_id, OLD.target_id);
  delta int := CASE TG_OP WHEN 'INSERT' THEN 1 WHEN 'DELETE' THEN -1 END;
BEGIN
  IF tgt_kind = 'thread' THEN
    UPDATE public.forum_threads SET vote_count = GREATEST(vote_count + delta, 0) WHERE id = tgt_id;
  ELSIF tgt_kind = 'reply' THEN
    UPDATE public.forum_replies SET vote_count = GREATEST(vote_count + delta, 0) WHERE id = tgt_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER forum_vote_count_ins AFTER INSERT ON public.forum_votes FOR EACH ROW EXECUTE FUNCTION public.forum_bump_vote_count();
CREATE TRIGGER forum_vote_count_del AFTER DELETE ON public.forum_votes FOR EACH ROW EXECUTE FUNCTION public.forum_bump_vote_count();

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('thread','reply','chat_thread')),
  target_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
CREATE INDEX IF NOT EXISTS forum_reports_status_idx ON public.forum_reports(status, created_at DESC);
GRANT SELECT, INSERT ON public.forum_reports TO authenticated;
GRANT ALL ON public.forum_reports TO service_role;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members report content" ON public.forum_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admins read all reports" ON public.forum_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage reports" ON public.forum_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ 3. MEMBER DMs ============
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS member_a_id uuid,
  ADD COLUMN IF NOT EXISTS member_b_id uuid;
CREATE INDEX IF NOT EXISTS chat_threads_member_dm_idx ON public.chat_threads (member_a_id, member_b_id) WHERE thread_type = 'member_dm';

CREATE OR REPLACE FUNCTION public.is_chat_participant(_thread_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = _thread_id AND _user_id IS NOT NULL
      AND (_user_id = t.pro_user_id OR _user_id = t.consumer_id OR _user_id = t.admin_user_id
           OR _user_id = t.subject_user_id OR _user_id = t.member_a_id OR _user_id = t.member_b_id)
  );
$$;

CREATE TABLE IF NOT EXISTS public.forum_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.forum_blocks TO authenticated;
GRANT ALL ON public.forum_blocks TO service_role;
ALTER TABLE public.forum_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage own blocks" ON public.forum_blocks FOR ALL TO authenticated
  USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.start_member_dm(_other_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
BEGIN
  IF v_me IS NULL OR _other_user IS NULL OR v_me = _other_user THEN RAISE EXCEPTION 'Invalid DM participants'; END IF;
  IF NOT public.has_active_plus_subscription(v_me) OR NOT public.has_active_plus_subscription(_other_user) THEN
    RAISE EXCEPTION 'Both members must have STRAND+ to chat';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forum_blocks WHERE (blocker_id = _other_user AND blocked_id = v_me) OR (blocker_id = v_me AND blocked_id = _other_user)) THEN
    RAISE EXCEPTION 'Messaging is not available with this member';
  END IF;
  IF v_me < _other_user THEN v_a := v_me; v_b := _other_user; ELSE v_a := _other_user; v_b := v_me; END IF;
  SELECT id INTO v_id FROM public.chat_threads WHERE thread_type = 'member_dm' AND member_a_id = v_a AND member_b_id = v_b LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.chat_threads (thread_type, member_a_id, member_b_id, subject_role) VALUES ('member_dm', v_a, v_b, 'consumer') RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.forum_dm_block_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.chat_threads%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.chat_threads WHERE id = NEW.thread_id;
  IF t.thread_type = 'member_dm' AND NEW.sender_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.forum_blocks fb
      WHERE (fb.blocker_id = t.member_a_id AND fb.blocked_id = t.member_b_id)
         OR (fb.blocker_id = t.member_b_id AND fb.blocked_id = t.member_a_id)) THEN
      RAISE EXCEPTION 'Messaging is not available with this member';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chat_messages_dm_block_guard BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.forum_dm_block_guard();

-- ============ 4. LIBRARY ============
CREATE TABLE IF NOT EXISTS public.content_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('course','ebook','video','article')),
  title text NOT NULL, description text NOT NULL DEFAULT '', cover_path text,
  sort_order integer NOT NULL DEFAULT 100, is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_collections TO authenticated;
GRANT ALL ON public.content_collections TO service_role;
ALTER TABLE public.content_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read published collections" ON public.content_collections FOR SELECT TO authenticated
  USING ((is_published AND public.has_active_plus_subscription(auth.uid())) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage collections" ON public.content_collections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER content_collections_updated BEFORE UPDATE ON public.content_collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.content_collections(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('video','pdf','text','audio','image')),
  title text NOT NULL, body_md text, storage_path text, external_url text,
  duration_seconds integer, sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_items_collection_idx ON public.content_items(collection_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read items" ON public.content_items FOR SELECT TO authenticated
  USING (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage items" ON public.content_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER content_items_updated BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.content_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
GRANT SELECT, INSERT, DELETE ON public.content_progress TO authenticated;
GRANT ALL ON public.content_progress TO service_role;
ALTER TABLE public.content_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own progress" ON public.content_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members write own progress" ON public.content_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members clear own progress" ON public.content_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ 5. EVENTS ============
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  kind text NOT NULL DEFAULT 'digital' CHECK (kind IN ('in_person','digital')),
  venue text, address text, join_url text, cover_path text, capacity integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events(starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plus members read events" ON public.events FOR SELECT TO authenticated
  USING (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage events" ON public.events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own RSVP" ON public.event_rsvps FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Members RSVP as self" ON public.event_rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_active_plus_subscription(auth.uid()));
CREATE POLICY "Members cancel own RSVP" ON public.event_rsvps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.event_rsvp_capacity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cap int; taken int;
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT capacity INTO cap FROM public.events WHERE id = NEW.event_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO taken FROM public.event_rsvps
    WHERE event_id = NEW.event_id AND cancelled_at IS NULL AND id <> NEW.id;
  IF taken >= cap THEN RAISE EXCEPTION 'Event is fully booked'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_rsvps_capacity BEFORE INSERT OR UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.event_rsvp_capacity_guard();

CREATE OR REPLACE FUNCTION public.admin_event_rsvps(_event_id uuid)
RETURNS TABLE(user_id uuid, display_name text, email text, created_at timestamptz, cancelled_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only admins can list RSVPs'; END IF;
  RETURN QUERY
  SELECT r.user_id, p.display_name, u.email::text, r.created_at, r.cancelled_at
  FROM public.event_rsvps r
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.event_id = _event_id ORDER BY r.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.forum_author_info(_user_ids uuid[])
RETURNS TABLE(user_id uuid, first_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id,
    NULLIF(split_part(COALESCE(p.display_name, ''), ' ', 1), ''),
    p.avatar_url
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids)
$$;
