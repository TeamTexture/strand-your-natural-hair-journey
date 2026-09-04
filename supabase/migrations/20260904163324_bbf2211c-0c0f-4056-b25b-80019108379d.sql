ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS superchat_contact_id text NULL;

CREATE OR REPLACE FUNCTION public.sync_superchat_contact_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Only fire when something Superchat cares about actually changed.
  if tg_op = 'UPDATE'
     and new.whatsapp_opt_in is not distinct from old.whatsapp_opt_in
     and new.phone_number is not distinct from old.phone_number
     and new.display_name is not distinct from old.display_name then
    return new;
  end if;

  -- Nothing to sync for a member who has never opted in.
  if coalesce(new.whatsapp_opt_in, false) = false
     and new.superchat_contact_id is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://wibimeglifveruvtvaxe.supabase.co/functions/v1/sync-superchat-contact',
      body := jsonb_build_object('user_id', new.user_id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'sync_superchat_contact_trigger failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_sync_superchat_contact ON public.profiles;
CREATE TRIGGER trg_sync_superchat_contact
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_superchat_contact_trigger();