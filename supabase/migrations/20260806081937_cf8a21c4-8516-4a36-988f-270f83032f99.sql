create table if not exists public.ad_events (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.brand_offers(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  session_id   text,
  slot         text not null default 'unknown'
                 check (slot in ('home','products','wash_day','pro_welcome','unknown')),
  event_type   text not null
                 check (event_type in ('view','expand','link_click','code_copy','wishlist')),
  occurred_at  timestamptz not null default now(),
  was_matched  boolean,
  match_reason jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.ad_events is
  'Append-only ad delivery log. Never UPDATE or DELETE. Aggregates are derived.';

grant select, insert on public.ad_events to authenticated;
grant all on public.ad_events to service_role;

create index if not exists ad_events_offer_time_idx
  on public.ad_events (offer_id, occurred_at desc);
create index if not exists ad_events_offer_type_day_idx
  on public.ad_events (offer_id, event_type, occurred_at desc);
create index if not exists ad_events_user_idx
  on public.ad_events (user_id);
create index if not exists ad_events_dedupe_idx
  on public.ad_events (offer_id, user_id, slot, event_type, occurred_at desc);

alter table public.ad_events enable row level security;

create policy ad_events_insert_own
  on public.ad_events for insert to authenticated
  with check (user_id = auth.uid());

create policy ad_events_admin_read
  on public.ad_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.record_ad_event(
  p_offer_id     uuid,
  p_event_type   text,
  p_slot         text    default 'unknown',
  p_was_matched  boolean default null,
  p_match_reason jsonb   default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  if p_event_type = 'view' and exists (
    select 1 from public.ad_events
    where offer_id   = p_offer_id
      and user_id    = v_user
      and slot       = p_slot
      and event_type = 'view'
      and occurred_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  insert into public.ad_events
    (offer_id, user_id, slot, event_type, was_matched, match_reason)
  values
    (p_offer_id, v_user, p_slot, p_event_type, p_was_matched, p_match_reason);
end;
$$;

revoke all on function public.record_ad_event(uuid, text, text, boolean, jsonb) from public;
grant execute on function public.record_ad_event(uuid, text, text, boolean, jsonb) to authenticated;