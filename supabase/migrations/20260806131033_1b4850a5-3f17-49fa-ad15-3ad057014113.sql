-- 1. Permanent, non-personal daily rollup ------------------------------------
create table if not exists public.ad_stats_daily (
  offer_id             uuid not null references public.brand_offers(id) on delete cascade,
  slot                 text not null,
  stat_date            date not null,
  impressions          bigint not null default 0,
  raw_views            bigint not null default 0,
  expands              bigint not null default 0,
  link_clicks          bigint not null default 0,
  code_copies          bigint not null default 0,
  wishlist_adds        bigint not null default 0,
  matched_impressions  bigint not null default 0,
  matched_link_clicks  bigint not null default 0,
  rolled_up_at         timestamptz not null default now(),
  primary key (offer_id, slot, stat_date)
);

comment on table public.ad_stats_daily is
  'Permanent aggregated ad delivery figures. Contains NO personal data. Survives the 24-month purge of public.ad_events. Key is (offer_id, slot, stat_date) with all three NOT NULL.';

grant select on public.ad_stats_daily to authenticated;
grant all on public.ad_stats_daily to service_role;

alter table public.ad_stats_daily enable row level security;

create policy ad_stats_daily_admin_read
  on public.ad_stats_daily for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

comment on table public.ad_events is
  'Append-only ad delivery log. Never UPDATE or DELETE individual rows. Aggregates are derived. RETENTION: personal-level rows are kept for a maximum of 24 months from occurred_at; a monthly pg_cron job (ad_events_retention_monthly) rolls figures into public.ad_stats_daily and then deletes older rows. user_id is ON DELETE SET NULL so deleting an account leaves non-personal rows behind.';

-- 2. Rollup function ---------------------------------------------------------
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
  where p_from is null or e.occurred_at::date >= p_from
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

-- 3. Retention job: roll up first, then purge personal-level rows ------------
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
  delete from public.ad_events
  where occurred_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_ad_events() from public;
grant execute on function public.purge_ad_events() to service_role;

-- 4. Continuous brand-facing figures ----------------------------------------
-- Live figures from the raw log for whatever it still holds, plus permanent
-- rollup rows for any (offer, slot, date) the log no longer covers.
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
  'Internal helper: raw-log figures where the log still holds the day, permanent rollup figures otherwise. No ownership filter - never grant this to authenticated. Read it through public.brand_offer_stats.';

revoke all on public.ad_stats_unified from anon, authenticated;

-- PRIVACY-CRITICAL: ownership must be enforced inside the view, because a view
-- runs as its owner and bypasses the underlying tables' RLS.
create or replace view public.brand_offer_stats as
select s.offer_id,
       s.slot,
       s.stat_date,
       s.impressions,
       s.raw_views,
       s.expands,
       s.link_clicks,
       s.code_copies,
       s.wishlist_adds,
       s.matched_impressions,
       s.matched_link_clicks
from public.ad_stats_unified s
join public.brand_offers o on o.id = s.offer_id
where o.brand_user_id = auth.uid() or public.has_role(auth.uid(), 'admin');

grant select on public.brand_offer_stats to authenticated;

create or replace function public.brand_offer_totals(_offer_ids uuid[])
returns table(offer_id uuid, impressions bigint, raw_views bigint, expands bigint,
              link_clicks bigint, code_copies bigint, wishlist_adds bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  return query
  select s.offer_id,
         sum(s.impressions)::bigint,
         sum(s.raw_views)::bigint,
         sum(s.expands)::bigint,
         sum(s.link_clicks)::bigint,
         sum(s.code_copies)::bigint,
         sum(s.wishlist_adds)::bigint
  from public.ad_stats_unified s
  join public.brand_offers o on o.id = s.offer_id
  where s.offer_id = any(_offer_ids)
    and (o.brand_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  group by s.offer_id;
end;
$$;

revoke all on function public.brand_offer_totals(uuid[]) from public, anon;
grant execute on function public.brand_offer_totals(uuid[]) to authenticated, service_role;

-- 5. Monthly schedule --------------------------------------------------------
select cron.unschedule('ad_events_retention_monthly')
where exists (select 1 from cron.job where jobname = 'ad_events_retention_monthly');

select cron.schedule(
  'ad_events_retention_monthly',
  '20 3 1 * *',
  $$select public.purge_ad_events();$$
);