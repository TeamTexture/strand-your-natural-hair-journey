-- extensions.http_post(text, jsonb, jsonb) does not exist in this project; pg_net
-- exposes net.http_post. Every notify trigger was silently warning and sending nothing.
CREATE OR REPLACE FUNCTION public.notify_message_recipient_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.kind in ('text', 'image', 'voice') and new.sender_id is not null then
    begin
      perform net.http_post(
        url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/notify-message-recipient',
        body := jsonb_build_object('message_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    exception when others then
      raise warning 'notify_message_recipient_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_pro_enquiry_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.pro_user_id is not null and new.pro_user_id <> new.consumer_id then
    begin
      perform net.http_post(
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
