CREATE OR REPLACE FUNCTION public.admin_notify_contact_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'contact_message',
    'New message',
    COALESCE(NULLIF(NEW.name, ''), 'Someone') || ' sent a message.',
    'contact_message', NEW.id, '/admin/messages?enquiry=' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_new_contact_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  BEGIN
    PERFORM extensions.http_post(
      url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-admin-message',
      body := jsonb_build_object('message_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_contact_message failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_contact_message ON public.contact_messages;
CREATE TRIGGER trg_notify_admin_new_contact_message
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_contact_message();