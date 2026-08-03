CREATE OR REPLACE FUNCTION public.notify_pro_new_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_name text;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), 'A member') INTO client_name
  FROM public.profiles WHERE user_id = NEW.consumer_id;

  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    NEW.pro_user_id, 'enquiry_new', NEW.consumer_id, 'enquiry', NEW.id,
    '/pro/enquiries',
    'New enquiry to review',
    COALESCE(client_name, 'A member') || ' sent you a new enquiry.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pro_enquiries_notify_pro ON public.pro_enquiries;
CREATE TRIGGER pro_enquiries_notify_pro
AFTER INSERT ON public.pro_enquiries
FOR EACH ROW EXECUTE FUNCTION public.notify_pro_new_enquiry();

-- Backfill: pending enquiries that never produced a notification.
INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
SELECT e.pro_user_id, 'enquiry_new', e.consumer_id, 'enquiry', e.id, '/pro/enquiries',
  'New enquiry to review',
  COALESCE(NULLIF(p.display_name, ''), 'A member') || ' sent you a new enquiry.'
FROM public.pro_enquiries e
LEFT JOIN public.profiles p ON p.user_id = e.consumer_id
WHERE e.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.entity_type = 'enquiry' AND n.entity_id = e.id AND n.kind = 'enquiry_new'
  );