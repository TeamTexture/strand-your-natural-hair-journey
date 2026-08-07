-- 1. ad_events: allow product-only engagement rows ---------------------------
alter table public.ad_events alter column offer_id drop not null;

alter table public.ad_events
  add column if not exists brand_product_id uuid references public.brand_products(id) on delete cascade;

alter table public.ad_events
  drop constraint if exists ad_events_target_present;
alter table public.ad_events
  add constraint ad_events_target_present
  check (offer_id is not null or brand_product_id is not null);

create index if not exists ad_events_product_type_time_idx
  on public.ad_events (brand_product_id, event_type, occurred_at desc)
  where brand_product_id is not null;

comment on column public.ad_events.brand_product_id is
  'Set when the interaction was with a brand shelf product. May be set alongside offer_id (product tagged by a live campaign). Offer-level reporting counts only rows where offer_id is not null.';

-- 2. Offer-level reporting: explicitly ignore product-only rows --------------
create or replace function public.rollup_ad_stats(p_from date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.ad_stats_daily as d (
    offer_id, slot, stat_date, impressions, raw_views, expands,
    link_clicks, code_copies, wishlist_adds, matched_impressions,
    matched_link_clicks, rolled_up_at
  )
  select e.offer_id,
         e.slot,
         e.occurred_at::date,
         count(distinct case when e.event_type = 'view'
               then coalesce(e.user_id::text, e.session_id) end),
         count(*) filter (where e.event_type = 'view'),
         count(*) filter (where e.event_type = 'expand'),
         count(*) filter (where e.event_type = 'link_click'),
         count(*) filter (where e.event_type = 'code_copy'),
         count(*) filter (where e.event_type = 'wishlist'),
         count(distinct case when e.event_type = 'view' and e.was_matched is true
               then e.user_id end),
         count(*) filter (where e.event_type = 'link_click' and e.was_matched is true),
         now()
  from public.ad_events e
  where e.offer_id is not null
    and (p_from is null or e.occurred_at::date >= p_from)
  group by e.offer_id, e.slot, e.occurred_at::date
  on conflict (offer_id, slot, stat_date) do update
    set impressions         = excluded.impressions,
        raw_views           = excluded.raw_views,
        expands             = excluded.expands,
        link_clicks         = excluded.link_clicks,
        code_copies         = excluded.code_copies,
        wishlist_adds       = excluded.wishlist_adds,
        matched_impressions = excluded.matched_impressions,
        matched_link_clicks = excluded.matched_link_clicks,
        rolled_up_at        = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.rollup_ad_stats(date) from public;
grant execute on function public.rollup_ad_stats(date) to service_role;

create or replace view public.ad_stats_unified as
with live as (
  select e.offer_id,
         e.slot,
         e.occurred_at::date as stat_date,
         count(distinct case when e.event_type = 'view'
               then coalesce(e.user_id::text, e.session_id) end) as impressions,
         count(*) filter (where e.event_type = 'view')           as raw_views,
         count(*) filter (where e.event_type = 'expand')         as expands,
         count(*) filter (where e.event_type = 'link_click')     as link_clicks,
         count(*) filter (where e.event_type = 'code_copy')      as code_copies,
         count(*) filter (where e.event_type = 'wishlist')       as wishlist_adds,
         count(distinct case when e.event_type = 'view' and e.was_matched is true
               then e.user_id end)                              as matched_impressions,
         count(*) filter (where e.event_type = 'link_click'
               and e.was_matched is true)                       as matched_link_clicks
  from public.ad_events e
  where e.offer_id is not null
  group by e.offer_id, e.slot, e.occurred_at::date
)
select * from live
union all
select d.offer_id, d.slot, d.stat_date, d.impressions, d.raw_views, d.expands,
       d.link_clicks, d.code_copies, d.wishlist_adds, d.matched_impressions,
       d.matched_link_clicks
from public.ad_stats_daily d
where not exists (
  select 1 from live l
  where l.offer_id = d.offer_id and l.slot = d.slot and l.stat_date = d.stat_date
);

comment on view public.ad_stats_unified is
  'Internal helper: raw-log figures where the log still holds the day, permanent rollup figures otherwise. Offer-attributed rows only (offer_id not null). No ownership filter - never grant this to authenticated. Read it through public.brand_offer_stats.';

revoke all on public.ad_stats_unified from anon, authenticated;

-- 3. Permanent, non-personal shelf-product rollup ----------------------------
create table if not exists public.brand_product_stats_daily (
  brand_product_id uuid not null references public.brand_products(id) on delete cascade,
  stat_date        date not null,
  expands          bigint not null default 0,
  code_copies      bigint not null default 0,
  link_clicks      bigint not null default 0,
  members          bigint not null default 0,
  rolled_up_at     timestamptz not null default now(),
  primary key (brand_product_id, stat_date)
);

comment on table public.brand_product_stats_daily is
  'Permanent aggregated shelf-product engagement. Contains NO personal data. Survives the 24-month purge of public.ad_events. Never exposed directly to brands - read through public.brand_shelf_engagement.';

grant select on public.brand_product_stats_daily to authenticated;
grant all on public.brand_product_stats_daily to service_role;

alter table public.brand_product_stats_daily enable row level security;

drop policy if exists brand_product_stats_daily_admin_read on public.brand_product_stats_daily;
create policy brand_product_stats_daily_admin_read
  on public.brand_product_stats_daily for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.rollup_brand_product_stats(p_from date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.brand_product_stats_daily as d (
    brand_product_id, stat_date, expands, code_copies, link_clicks, members, rolled_up_at
  )
  select e.brand_product_id,
         e.occurred_at::date,
         count(*) filter (where e.event_type = 'expand'),
         count(*) filter (where e.event_type = 'code_copy'),
         count(*) filter (where e.event_type = 'link_click'),
         count(distinct coalesce(e.user_id::text, e.session_id)),
         now()
  from public.ad_events e
  where e.brand_product_id is not null
    and (p_from is null or e.occurred_at::date >= p_from)
  group by e.brand_product_id, e.occurred_at::date
  on conflict (brand_product_id, stat_date) do update
    set expands      = excluded.expands,
        code_copies  = excluded.code_copies,
        link_clicks  = excluded.link_clicks,
        members      = excluded.members,
        rolled_up_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.rollup_brand_product_stats(date) from public;
grant execute on function public.rollup_brand_product_stats(date) to service_role;

-- 4. Retention: roll BOTH streams up before deleting personal-level rows -----
create or replace function public.purge_ad_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  perform public.rollup_ad_stats(null);
  perform public.rollup_brand_product_stats(null);
  delete from public.ad_events
  where occurred_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_ad_events() from public;
grant execute on function public.purge_ad_events() to service_role;

-- 5. One write path, now able to carry a product ----------------------------
drop function if exists public.record_ad_event(uuid, text, text, boolean, jsonb);

create or replace function public.record_ad_event(
  p_offer_id         uuid    default null,
  p_event_type       text    default null,
  p_slot             text    default 'unknown',
  p_was_matched      boolean default null,
  p_match_reason     jsonb   default null,
  p_brand_product_id uuid    default null
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
  if p_event_type is null then
    raise exception 'event_type is required';
  end if;
  if p_offer_id is null and p_brand_product_id is null then
    raise exception 'an offer or a brand product is required';
  end if;

  if p_event_type = 'view' and exists (
    select 1 from public.ad_events
    where offer_id   is not distinct from p_offer_id
      and brand_product_id is not distinct from p_brand_product_id
      and user_id    = v_user
      and slot       = p_slot
      and event_type = 'view'
      and occurred_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  insert into public.ad_events
    (offer_id, brand_product_id, user_id, slot, event_type, was_matched, match_reason)
  values
    (p_offer_id, p_brand_product_id, v_user, p_slot, p_event_type, p_was_matched, p_match_reason);
end;
$$;

revoke all on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid) from public;
grant execute on function public.record_ad_event(uuid, text, text, boolean, jsonb, uuid) to authenticated;

-- 6. Brand-facing shelf engagement, suppressed below the member floor -------
create or replace function public.brand_shelf_engagement(_brand_user_id uuid default null)
returns table(
  brand_product_id uuid,
  name text,
  shelf_count integer,
  wishlist_count integer,
  favourite_count integer,
  expands integer,
  code_copies integer,
  link_clicks integer,
  suppressed boolean,
  min_threshold integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_brand uuid := coalesce(_brand_user_id, auth.uid());
  v_min integer := public.brand_count_min_threshold();
  v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  v_admin := public.has_role(auth.uid(), 'admin');
  if v_brand <> auth.uid() and not v_admin then
    raise exception 'Not permitted';
  end if;

  return query
  with prods as (
    select p.id, p.name from public.brand_products p where p.brand_user_id = v_brand
  ),
  live_ev as (
    select e.brand_product_id as pid,
           count(*) filter (where e.event_type = 'expand')     as expands,
           count(*) filter (where e.event_type = 'code_copy')  as code_copies,
           count(*) filter (where e.event_type = 'link_click') as link_clicks,
           count(distinct coalesce(e.user_id::text, e.session_id)) as members
    from public.ad_events e
    where e.brand_product_id in (select id from prods)
    group by e.brand_product_id
  ),
  archived as (
    select d.brand_product_id as pid,
           sum(d.expands) as expands, sum(d.code_copies) as code_copies,
           sum(d.link_clicks) as link_clicks, max(d.members) as members
    from public.brand_product_stats_daily d
    where d.brand_product_id in (select id from prods)
      and not exists (select 1 from public.ad_events e
                      where e.brand_product_id = d.brand_product_id
                        and e.occurred_at::date = d.stat_date)
    group by d.brand_product_id
  ),
  raw as (
    select
      pr.id,
      pr.name,
      (select count(*) from public.user_products up
        where up.linked_brand_product_id = pr.id and up.on_shelf)::int as shelf_raw,
      (select count(*) from public.user_products up
        where up.linked_brand_product_id = pr.id and up.on_wishlist)::int as wish_raw,
      (select count(*) from public.user_products up
        where up.linked_brand_product_id = pr.id and up.on_favourite)::int as fav_raw,
      (coalesce((select l.expands from live_ev l where l.pid = pr.id), 0)
       + coalesce((select a.expands from archived a where a.pid = pr.id), 0))::int as expand_raw,
      (coalesce((select l.code_copies from live_ev l where l.pid = pr.id), 0)
       + coalesce((select a.code_copies from archived a where a.pid = pr.id), 0))::int as copy_raw,
      (coalesce((select l.link_clicks from live_ev l where l.pid = pr.id), 0)
       + coalesce((select a.link_clicks from archived a where a.pid = pr.id), 0))::int as click_raw,
      greatest(
        coalesce((select l.members from live_ev l where l.pid = pr.id), 0),
        coalesce((select a.members from archived a where a.pid = pr.id), 0)
      )::int as member_raw
    from prods pr
  )
  select
    r.id,
    r.name,
    -- Suppression happens HERE, at the data layer. Admins see exact figures.
    case when v_admin or r.shelf_raw  >= v_min then r.shelf_raw  else null end,
    case when v_admin or r.wish_raw   >= v_min then r.wish_raw   else null end,
    case when v_admin or r.fav_raw    >= v_min then r.fav_raw    else null end,
    case when v_admin or r.member_raw >= v_min then r.expand_raw else null end,
    case when v_admin or r.member_raw >= v_min then r.copy_raw   else null end,
    case when v_admin or r.member_raw >= v_min then r.click_raw  else null end,
    (not v_admin
      and r.shelf_raw < v_min and r.wish_raw < v_min and r.fav_raw < v_min
      and r.member_raw < v_min),
    v_min
  from raw r
  order by r.name;
end;
$$;

revoke all on function public.brand_shelf_engagement(uuid) from public, anon;
grant execute on function public.brand_shelf_engagement(uuid) to authenticated, service_role;

comment on function public.brand_shelf_engagement(uuid) is
  'Brand-facing shelf engagement. Counts only - no user ids are returned or reachable. Every figure is suppressed below public.brand_count_min_threshold() members unless the caller is an admin.';
