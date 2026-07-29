CREATE OR REPLACE FUNCTION public.notify_chat_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.chat_threads%ROWTYPE;
  recips uuid[];
  r uuid;
  sender_label text;
BEGIN
  IF NEW.kind <> 'text' OR NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.chat_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF t.thread_type = 'admin_support' THEN
    IF NEW.sender_role = 'admin' OR NEW.sender_id = t.admin_user_id THEN
      recips := ARRAY[t.subject_user_id];
      sender_label := 'STRAND Team';
    ELSE
      recips := ARRAY[t.admin_user_id];
      sender_label := COALESCE((SELECT display_name FROM public.profiles WHERE user_id = NEW.sender_id), 'A member');
    END IF;
  ELSE
    recips := ARRAY[t.pro_user_id, t.consumer_id, t.member_a_id, t.member_b_id];
    sender_label := COALESCE(
      (SELECT display_name FROM public.pro_profiles WHERE user_id = NEW.sender_id AND NEW.sender_role = 'pro'),
      (SELECT display_name FROM public.profiles WHERE user_id = NEW.sender_id),
      'New message'
    );
  END IF;

  FOREACH r IN ARRAY recips LOOP
    IF r IS NOT NULL AND r <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
      VALUES (
        r,
        'chat_message',
        NEW.sender_id,
        'chat_thread',
        NEW.thread_id,
        '/messages/' || NEW.thread_id::text,
        sender_label || ' sent you a message',
        left(NEW.body, 140)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_recipient ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_recipient
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_chat_recipient();