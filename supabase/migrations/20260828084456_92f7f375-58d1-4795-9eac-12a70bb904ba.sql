-- 1. Signed votes -------------------------------------------------------
ALTER TABLE public.forum_votes
  ADD COLUMN IF NOT EXISTS value smallint NOT NULL DEFAULT 1;

UPDATE public.forum_votes SET value = 1 WHERE value IS NULL OR value NOT IN (-1, 1);

ALTER TABLE public.forum_votes
  DROP CONSTRAINT IF EXISTS forum_votes_value_check;
ALTER TABLE public.forum_votes
  ADD CONSTRAINT forum_votes_value_check CHECK (value IN (-1, 1));

CREATE OR REPLACE FUNCTION public.forum_bump_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tgt_kind text := COALESCE(NEW.target_kind, OLD.target_kind);
  tgt_id uuid := COALESCE(NEW.target_id, OLD.target_id);
  delta int := CASE TG_OP
                 WHEN 'INSERT' THEN COALESCE(NEW.value, 1)
                 WHEN 'DELETE' THEN -COALESCE(OLD.value, 1)
                 WHEN 'UPDATE' THEN COALESCE(NEW.value, 1) - COALESCE(OLD.value, 1)
               END;
BEGIN
  IF delta = 0 THEN RETURN COALESCE(NEW, OLD); END IF;
  IF tgt_kind = 'thread' THEN
    UPDATE public.forum_threads SET vote_count = vote_count + delta WHERE id = tgt_id;
  ELSIF tgt_kind = 'reply' THEN
    UPDATE public.forum_replies SET vote_count = vote_count + delta WHERE id = tgt_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS forum_vote_count_upd ON public.forum_votes;
CREATE TRIGGER forum_vote_count_upd
  AFTER UPDATE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.forum_bump_vote_count();

-- Recompute all scores from the source of truth.
UPDATE public.forum_threads t
SET vote_count = COALESCE((
  SELECT SUM(v.value) FROM public.forum_votes v
  WHERE v.target_kind = 'thread' AND v.target_id = t.id
), 0);

UPDATE public.forum_replies r
SET vote_count = COALESCE((
  SELECT SUM(v.value) FROM public.forum_votes v
  WHERE v.target_kind = 'reply' AND v.target_id = r.id
), 0);

-- 2. Two-level nesting --------------------------------------------------
ALTER TABLE public.forum_replies
  ADD COLUMN IF NOT EXISTS depth smallint NOT NULL DEFAULT 0;

ALTER TABLE public.forum_replies
  DROP CONSTRAINT IF EXISTS forum_replies_depth_check;
ALTER TABLE public.forum_replies
  ADD CONSTRAINT forum_replies_depth_check CHECK (depth IN (0, 1));

-- Promote orphans instead of destroying them when a parent is deleted.
ALTER TABLE public.forum_replies
  DROP CONSTRAINT IF EXISTS forum_replies_parent_reply_id_fkey;
ALTER TABLE public.forum_replies
  ADD CONSTRAINT forum_replies_parent_reply_id_fkey
  FOREIGN KEY (parent_reply_id) REFERENCES public.forum_replies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS forum_replies_parent_idx
  ON public.forum_replies (thread_id, parent_reply_id, created_at);

-- Enforce the 2-level cap: a reply to a nested reply attaches to that
-- reply's parent, staying at depth 1.
CREATE OR REPLACE FUNCTION public.forum_reply_cap_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p_depth smallint;
  p_parent uuid;
  p_thread uuid;
BEGIN
  IF NEW.parent_reply_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT depth, parent_reply_id, thread_id
    INTO p_depth, p_parent, p_thread
  FROM public.forum_replies WHERE id = NEW.parent_reply_id;

  IF p_depth IS NULL THEN
    NEW.parent_reply_id := NULL;
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  IF p_thread <> NEW.thread_id THEN
    RAISE EXCEPTION 'Parent reply belongs to a different thread';
  END IF;

  IF p_depth >= 1 THEN
    NEW.parent_reply_id := COALESCE(p_parent, NEW.parent_reply_id);
  END IF;

  NEW.depth := 1;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS forum_reply_cap_depth_trg ON public.forum_replies;
CREATE TRIGGER forum_reply_cap_depth_trg
  BEFORE INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.forum_reply_cap_depth();

-- Children promoted by ON DELETE SET NULL must return to depth 0.
CREATE OR REPLACE FUNCTION public.forum_reply_promote_orphan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.parent_reply_id IS NULL AND NEW.depth <> 0 THEN
    NEW.depth := 0;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS forum_reply_promote_orphan_trg ON public.forum_replies;
CREATE TRIGGER forum_reply_promote_orphan_trg
  BEFORE UPDATE OF parent_reply_id ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.forum_reply_promote_orphan();

-- 3. Structured mentions ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forum_mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_kind text NOT NULL CHECK (target_kind IN ('thread', 'reply')),
  target_id uuid NOT NULL,
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind, target_id, user_id)
);

GRANT SELECT, INSERT ON public.forum_mentions TO authenticated;
GRANT ALL ON public.forum_mentions TO service_role;

ALTER TABLE public.forum_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read forum mentions"
  ON public.forum_mentions FOR SELECT TO authenticated
  USING (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authors record their own mentions"
  ON public.forum_mentions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS forum_mentions_target_idx
  ON public.forum_mentions (target_kind, target_id);

-- Notify from the structured record (id-based, no name matching).
CREATE OR REPLACE FUNCTION public.notify_forum_mention_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id = NEW.created_by THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    NEW.user_id, 'mention', NEW.created_by,
    CASE WHEN NEW.target_kind = 'thread' THEN 'forum_thread' ELSE 'forum_reply' END,
    NEW.target_id,
    '/forum/' || NEW.thread_id::text,
    CASE WHEN NEW.target_kind = 'thread' THEN 'You were tagged in a thread' ELSE 'You were tagged in a reply' END,
    left(COALESCE((
      CASE WHEN NEW.target_kind = 'thread'
        THEN (SELECT title FROM public.forum_threads WHERE id = NEW.target_id)
        ELSE (SELECT body FROM public.forum_replies WHERE id = NEW.target_id)
      END), ''), 140)
  );
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_notify_forum_mention_row ON public.forum_mentions;
CREATE TRIGGER trg_notify_forum_mention_row
  AFTER INSERT ON public.forum_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_forum_mention_row();

-- 4. Reply-to-my-comment notification ----------------------------------
CREATE OR REPLACE FUNCTION public.notify_forum_reply_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE parent_author uuid;
BEGIN
  IF NEW.parent_reply_id IS NULL THEN RETURN NEW; END IF;
  SELECT author_id INTO parent_author FROM public.forum_replies WHERE id = NEW.parent_reply_id;
  IF parent_author IS NULL OR parent_author = NEW.author_id THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (parent_author, 'forum_reply', NEW.author_id, 'forum_reply', NEW.id,
          '/forum/' || NEW.thread_id::text,
          'Someone replied to your comment',
          left(COALESCE(NEW.body, ''), 140));
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_notify_forum_reply_parent ON public.forum_replies;
CREATE TRIGGER trg_notify_forum_reply_parent
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_forum_reply_parent();

-- 5. Thread-scoped mention search --------------------------------------
CREATE OR REPLACE FUNCTION public.forum_mention_search(_thread_id uuid, _query text, _limit integer DEFAULT 12)
RETURNS TABLE(kind text, entity_id uuid, label text, subtitle text, avatar_url text, in_thread boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  RETURN QUERY
  WITH q AS (SELECT COALESCE(NULLIF(trim(_query), ''), '') AS s),
  participants AS (
    SELECT DISTINCT uid FROM (
      SELECT author_id AS uid FROM public.forum_threads WHERE id = _thread_id
      UNION ALL
      SELECT author_id AS uid FROM public.forum_replies WHERE thread_id = _thread_id
    ) x WHERE uid IS NOT NULL
  ),
  cand AS (
    SELECT
      p.user_id,
      p.display_name AS label,
      p.avatar_url,
      (pt.uid IS NOT NULL) AS in_thread,
      CASE WHEN p.display_name ILIKE (SELECT s FROM q) || '%' THEN 0 ELSE 1 END AS rnk
    FROM public.profiles p
    LEFT JOIN participants pt ON pt.uid = p.user_id
    CROSS JOIN q
    WHERE p.display_name IS NOT NULL AND trim(p.display_name) <> ''
      AND (q.s = '' OR p.display_name ILIKE '%' || q.s || '%')
  )
  SELECT
    'member'::text,
    c.user_id,
    c.label,
    CASE WHEN c.in_thread THEN 'In this thread' ELSE 'Member' END,
    c.avatar_url,
    c.in_thread
  FROM cand c
  ORDER BY c.in_thread DESC, c.rnk, c.label ASC
  LIMIT LEAST(GREATEST(_limit, 1), 20);
END $function$;

GRANT EXECUTE ON FUNCTION public.forum_mention_search(uuid, text, integer) TO authenticated;