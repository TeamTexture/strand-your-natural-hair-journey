alter table public.ad_events
  add column if not exists unit text not null default 'advert';

comment on column public.ad_events.unit is
  'Which on-page unit produced the event: advert (the approved advert placement) or wash_day_tip (the sponsored wash day tip card).';

create index if not exists ad_events_unit_idx on public.ad_events (unit);

create or replace function public.record_ad_event(
  p_offer_id         uuid    default null,
  p_event_type       text    default null,
  p_slot             text    default 'unknown',
  p_was_matched      boolean default null,
  p_match_reason     jsonb   default null,
  p_brand_product_id uuid    default null,
  p_unit             text    default 'advert'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'advert');
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
  if v_unit not in ('advert', 'wash_day_tip') then
    v_unit := 'advert';
  end if;

  if p_event_type = 'view' and exists (
    select 1 from public.ad_events
    where offer_id   is not distinct from p_offer_id
      and brand_product_id is not distinct from p_brand_product_id
      and user_id    = v_user
      and slot       = p_slot
      and unit       = v_unit
      and event_type = 'view'
      and occurred_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  insert into public.ad_events
    (offer_id, brand_product_id, user_id, slot, event_type, was_matched, match_reason, unit)
  values
    (p_offer_id, p_brand_product_id, v_user, p_slot, p_event_type, p_was_matched, p_match_reason, v_unit);
end;
$$;

revoke all on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid, text) from public;
grant execute on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid, text) to authenticated;