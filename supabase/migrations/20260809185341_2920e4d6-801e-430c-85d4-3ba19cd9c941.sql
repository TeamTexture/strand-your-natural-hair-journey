create or replace function public.notify_message_recipient_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'text' and new.sender_id is not null then
    begin
      perform extensions.http_post(
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
$$;

drop trigger if exists trg_notify_message_recipient_email on public.chat_messages;
create trigger trg_notify_message_recipient_email
after insert on public.chat_messages
for each row execute function public.notify_message_recipient_email();