
-- 1) BRAND PROFILES: category, about, contact_email
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS contact_email text;

UPDATE public.brand_profiles
   SET category = 'Hair Care'
 WHERE category IS NULL
   AND brand_name IN ('STRAND', 'Revlon Professional', 'Team Texture');

-- Widen brand_profiles SELECT so signed-in members can browse the brand directory.
DROP POLICY IF EXISTS "Authenticated can read brand profiles" ON public.brand_profiles;
CREATE POLICY "Authenticated can read brand profiles"
  ON public.brand_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow signed-in members to read past (ended) offers so the consumer brand
-- detail page can show a "Past offers" strip. Live-window policy already exists.
DROP POLICY IF EXISTS "Ended offers readable by authenticated" ON public.brand_offers;
CREATE POLICY "Ended offers readable by authenticated"
  ON public.brand_offers FOR SELECT
  TO authenticated
  USING (status = 'ended'::brand_offer_status);

-- Products of ended offers, same rationale.
DROP POLICY IF EXISTS "Products of ended offers readable by authenticated" ON public.brand_products;
CREATE POLICY "Products of ended offers readable by authenticated"
  ON public.brand_products FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brand_offers o
    WHERE o.id = brand_products.offer_id
      AND o.status = 'ended'::brand_offer_status
  ));

-- 2) CHAT THREADS: support admin↔user conversations
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'client_pro',
  ADD COLUMN IF NOT EXISTS admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS subject_user_id uuid;

ALTER TABLE public.chat_threads
  ALTER COLUMN enquiry_id DROP NOT NULL,
  ALTER COLUMN pro_user_id DROP NOT NULL,
  ALTER COLUMN consumer_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS chat_threads_admin_subject_idx
  ON public.chat_threads(admin_user_id, subject_user_id)
  WHERE thread_type = 'admin_support';

CREATE OR REPLACE FUNCTION public.is_chat_participant(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = _thread_id
      AND _user_id IS NOT NULL
      AND (
        _user_id = t.pro_user_id
        OR _user_id = t.consumer_id
        OR _user_id = t.admin_user_id
        OR _user_id = t.subject_user_id
      )
  );
$$;

-- Rewrite chat_threads RLS using the helper so admin_support threads work.
DROP POLICY IF EXISTS "Admins can view all threads (metadata only)" ON public.chat_threads;
DROP POLICY IF EXISTS "Participants can view their threads" ON public.chat_threads;
CREATE POLICY "Participants can view their threads"
  ON public.chat_threads FOR SELECT
  TO authenticated
  USING (public.is_chat_participant(id, auth.uid()));

-- Rewrite chat_messages RLS.
DROP POLICY IF EXISTS "Participants can view their messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Participants can mark their incoming messages read" ON public.chat_messages;

CREATE POLICY "Participants can view their messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (public.is_chat_participant(thread_id, auth.uid()));

CREATE POLICY "Participants can send messages"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    kind = 'text'
    AND sender_id = auth.uid()
    AND public.is_chat_participant(thread_id, auth.uid())
  );

CREATE POLICY "Participants can mark their incoming messages read"
  ON public.chat_messages FOR UPDATE
  TO authenticated
  USING (public.is_chat_participant(thread_id, auth.uid()) AND sender_id IS DISTINCT FROM auth.uid())
  WITH CHECK (public.is_chat_participant(thread_id, auth.uid()));

-- RPC: admin starts (or finds) a support thread with any user.
CREATE OR REPLACE FUNCTION public.admin_start_support_thread(_subject_user uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_id uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Only admins can start support threads';
  END IF;
  IF _subject_user IS NULL OR _subject_user = v_admin THEN
    RAISE EXCEPTION 'Subject user required';
  END IF;

  SELECT id INTO v_id
    FROM public.chat_threads
   WHERE thread_type = 'admin_support'
     AND admin_user_id = v_admin
     AND subject_user_id = _subject_user
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.chat_threads (thread_type, admin_user_id, subject_user_id)
    VALUES ('admin_support', v_admin, _subject_user)
    RETURNING id INTO v_id;

  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body)
    VALUES (v_id, NULL, 'system', 'Chat opened by STRAND Team.');

  RETURN v_id;
END;
$$;

-- 3) COMPLIMENTARY: seed subscriptions + emails allow list
-- Rio + Yvonne active-forever
INSERT INTO public.pro_subscriptions (pro_user_id, status, current_period_end)
  VALUES ('6039cf50-3665-4166-883a-a3957c36f832', 'active', NULL),
         ('b1c78f28-bcdf-47a6-b61a-96ee872c68ac', 'active', NULL)
  ON CONFLICT (pro_user_id) DO UPDATE
    SET status = 'active', current_period_end = NULL, cancel_at_period_end = false;

INSERT INTO public.brand_subscriptions (brand_user_id, status, current_period_end)
  VALUES ('b1c78f28-bcdf-47a6-b61a-96ee872c68ac', 'active', NULL)
  ON CONFLICT (brand_user_id) DO UPDATE
    SET status = 'active', current_period_end = NULL, cancel_at_period_end = false;

-- complimentary email allow-list. Seed with placeholder for Erica.
INSERT INTO public.platform_settings (key, value)
  VALUES ('complimentary_emails', '["erica.liburd@gmail.com"]'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Update handle_new_user to consult the allow list.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emails jsonb;
  v_complimentary boolean := false;
BEGIN
  SELECT value INTO v_emails FROM public.platform_settings WHERE key = 'complimentary_emails';
  IF v_emails IS NOT NULL AND jsonb_typeof(v_emails) = 'array' THEN
    v_complimentary := EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_emails) e
      WHERE lower(trim(e)) = lower(trim(coalesce(new.email, '')))
    );
  END IF;

  INSERT INTO public.profiles (user_id, display_name, complimentary_access)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
      v_complimentary
    )
    ON CONFLICT (user_id) DO UPDATE
      SET complimentary_access = public.profiles.complimentary_access OR EXCLUDED.complimentary_access;
  RETURN new;
END;
$$;
