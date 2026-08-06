alter table public.brand_offer_stats rename to brand_offer_stats_legacy;

comment on table public.brand_offer_stats_legacy is
  'Frozen 2026-08-06. Counter-based, affected by the NULL-slot upsert bug and the ambiguous tap definition. Directional only. Do not bill from this and do not backfill ad_events from it.';

drop function if exists public.increment_brand_offer_stat(uuid, brand_placement_slot, text);

create or replace view public.brand_offer_stats as
select
  e.offer_id,
  e.slot,
  e.occurred_at::date as stat_date,
  count(distinct case when e.event_type = 'view'
        then coalesce(e.user_id::text, e.session_id) end)      as impressions,
  count(*) filter (where e.event_type = 'view')                as raw_views,
  count(*) filter (where e.event_type = 'expand')              as expands,
  count(*) filter (where e.event_type = 'link_click')          as link_clicks,
  count(*) filter (where e.event_type = 'code_copy')           as code_copies,
  count(*) filter (where e.event_type = 'wishlist')            as wishlist_adds,
  count(distinct case when e.event_type = 'view' and e.was_matched is true
        then e.user_id end)                                    as matched_impressions,
  count(*) filter (where e.event_type = 'link_click'
        and e.was_matched is true)                             as matched_link_clicks
from public.ad_events e
join public.brand_offers o on o.id = e.offer_id
where o.brand_user_id = auth.uid()
   or public.has_role(auth.uid(), 'admin')
group by e.offer_id, e.slot, e.occurred_at::date;

grant select on public.brand_offer_stats to authenticated;

drop function if exists public.brand_offer_totals(uuid[]);

create or replace function public.brand_offer_totals(_offer_ids uuid[])
returns table(
  offer_id uuid,
  impressions bigint,
  raw_views bigint,
  expands bigint,
  link_clicks bigint,
  code_copies bigint,
  wishlist_adds bigint
)
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
  select e.offer_id,
         count(distinct case when e.event_type = 'view' then coalesce(e.user_id::text, e.session_id) end)::bigint,
         count(*) filter (where e.event_type = 'view')::bigint,
         count(*) filter (where e.event_type = 'expand')::bigint,
         count(*) filter (where e.event_type = 'link_click')::bigint,
         count(*) filter (where e.event_type = 'code_copy')::bigint,
         count(*) filter (where e.event_type = 'wishlist')::bigint
  from public.ad_events e
  join public.brand_offers o on o.id = e.offer_id
  where e.offer_id = any(_offer_ids)
    and (o.brand_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  group by e.offer_id;
end;
$$;

revoke all on function public.brand_offer_totals(uuid[]) from public;
grant execute on function public.brand_offer_totals(uuid[]) to authenticated;

update public.brand_offers
set status = 'ended', updated_at = now()
where status = 'live'
  and ends_on is not null
  and ends_on < current_date;