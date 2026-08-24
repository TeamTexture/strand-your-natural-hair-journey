CREATE OR REPLACE FUNCTION public.notify_pro_enquiry_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.pro_user_id is not null and new.pro_user_id <> new.consumer_id then
    begin
      perform extensions.http_post(
        url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-pro-enquiry',
        body := jsonb_build_object('enquiry_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    exception when others then
      raise warning 'notify_pro_enquiry_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_notify_pro_enquiry_email ON public.pro_enquiries;
CREATE TRIGGER trg_notify_pro_enquiry_email
AFTER INSERT ON public.pro_enquiries
FOR EACH ROW EXECUTE FUNCTION public.notify_pro_enquiry_email();

UPDATE public.platform_settings
SET value = '["onboarding-next-steps","international-waitlist","pro-new-enquiry"]'::jsonb
WHERE key = 'email_templates_enabled';