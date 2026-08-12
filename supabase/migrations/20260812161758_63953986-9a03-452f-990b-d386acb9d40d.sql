-- 1. ad_events: remove direct member writes; all logging goes via record_ad_event
drop policy if exists "ad_events_insert_own" on public.ad_events;
revoke insert on public.ad_events from authenticated;

-- record_ad_event now computes matching server-side, ignoring client-supplied values
create or replace function public.record_ad_event(
  p_offer_id uuid default null,
  p_event_type text default null,
  p_slot text default 'unknown',
  p_was_matched boolean default null,
  p_match_reason jsonb default null,
  p_brand_product_id uuid default null,
  p_unit text default 'advert'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'advert');
  v_matched boolean := null;
  v_reason jsonb := null;
  v_codes text[];
begin
  if v_user is null then
    return;
  end if;
  if p_event_type is null then
    raise exception 'event_type is required';
  end if;
  if p_offer_id is null and p_brand_product_id is null then
    raise exception 'an offer or a brand product is required';
  end if;
  if v_unit not in ('advert','wash_day_tip') then
    v_unit := 'advert';
  end if;

  -- Matching is derived from the campaign's own targeting rules and this
  -- member's attributes. Client-supplied p_was_matched / p_match_reason are
  -- accepted for signature compatibility but never trusted.
  if p_offer_id is not null then
    select m.match_reason into v_codes
    from public.ad_match_users(public.ad_offer_rules(p_offer_id)) m
    where m.user_id = v_user
    limit 1;
    if v_codes is not null then
      v_matched := true;
      v_reason := jsonb_build_object('codes', to_jsonb(v_codes));
    end if;
  end if;

  if p_event_type = 'view' and exists (
    select 1 from public.ad_events
    where offer_id is not distinct from p_offer_id
      and brand_product_id is not distinct from p_brand_product_id
      and user_id = v_user
      and slot = p_slot
      and event_type = 'view'
      and unit = v_unit
      and occurred_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  insert into public.ad_events
    (offer_id, brand_product_id, user_id, slot, event_type, was_matched, match_reason, unit)
  values
    (p_offer_id, p_brand_product_id, v_user, p_slot, p_event_type, v_matched, v_reason, v_unit);
end;
$function$;

drop function if exists public.record_ad_event(uuid, text, text, boolean, jsonb, uuid);
revoke all on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid, text) from public, anon;
grant execute on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid, text) to authenticated;

-- 2. pro_referral_attributions: no member-authored rows
drop policy if exists "Users log own attribution events" on public.pro_referral_attributions;
revoke insert on public.pro_referral_attributions from authenticated;

create or replace function public.log_referral_attribution(
  p_event_type text,
  p_pro_user_id uuid default null,
  p_directory_id uuid default null,
  p_enquiry_id uuid default null,
  p_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  if p_event_type not in ('enquiry','booking','click') then
    raise exception 'invalid event_type';
  end if;
  -- The member may only attribute their OWN enquiry / appointment.
  if p_enquiry_id is not null and not exists (
    select 1 from public.pro_enquiries e
    where e.id = p_enquiry_id and e.consumer_id = v_user
  ) then
    raise exception 'enquiry not found';
  end if;
  if p_appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.user_id = v_user
  ) then
    raise exception 'appointment not found';
  end if;

  -- booking_value / amount_owed are financial and stay NULL here: only admins
  -- and trusted server logic may set them.
  insert into public.pro_referral_attributions
    (consumer_id, pro_user_id, directory_id, enquiry_id, appointment_id, event_type)
  values
    (v_user, p_pro_user_id, p_directory_id, p_enquiry_id, p_appointment_id, p_event_type);
end;
$function$;

revoke all on function public.log_referral_attribution(text, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.log_referral_attribution(text, uuid, uuid, uuid, uuid) to authenticated;