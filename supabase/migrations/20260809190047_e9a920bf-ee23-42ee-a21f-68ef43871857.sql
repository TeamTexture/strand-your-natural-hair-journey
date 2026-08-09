-- Brand catalogue tools live in public.user_tools, products in public.user_products.
-- Both counted the same way, de-duplicated per member.
create or replace function public.brand_shelf_engagement(_brand_user_id uuid default null::uuid)
returns table(brand_product_id uuid, name text, shelf_count integer, wishlist_count integer, favourite_count integer, expands integer, code_copies integer, link_clicks integer, suppressed boolean, min_threshold integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  owned as (
    select up.linked_brand_product_id as pid, up.user_id,
           coalesce(up.on_shelf,false) as on_shelf,
           coalesce(up.on_wishlist,false) as on_wishlist,
           coalesce(up.on_favourite,false) as on_favourite
    from public.user_products up
    where up.linked_brand_product_id in (select id from prods)
    union all
    select ut.linked_brand_product_id, ut.user_id,
           coalesce(ut.on_shelf,false),
           coalesce(ut.on_wishlist,false),
           coalesce(ut.on_favourite,false)
    from public.user_tools ut
    where ut.linked_brand_product_id in (select id from prods)
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
      (select count(distinct o.user_id) from owned o where o.pid = pr.id and o.on_shelf)::int as shelf_raw,
      (select count(distinct o.user_id) from owned o where o.pid = pr.id and o.on_wishlist)::int as wish_raw,
      (select count(distinct o.user_id) from owned o where o.pid = pr.id and o.on_favourite)::int as fav_raw,
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
$function$;

create or replace function public.brand_product_member_counts(_brand_user_id uuid default null::uuid)
returns table(brand_product_id uuid, name text, shelf_count integer, wishlist_count integer, favourite_count integer, suppressed boolean, min_threshold integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_brand uuid := COALESCE(_brand_user_id, auth.uid());
  v_min integer := public.brand_count_min_threshold();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_brand <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  RETURN QUERY
  WITH prods AS (
    SELECT p.id, p.name FROM public.brand_products p WHERE p.brand_user_id = v_brand
  ),
  owned AS (
    SELECT up.linked_brand_product_id AS pid, up.user_id,
           COALESCE(up.on_shelf,false) AS on_shelf,
           COALESCE(up.on_wishlist,false) AS on_wishlist,
           COALESCE(up.on_favourite,false) AS on_favourite
    FROM public.user_products up
    WHERE up.linked_brand_product_id IN (SELECT id FROM prods)
    UNION ALL
    SELECT ut.linked_brand_product_id, ut.user_id,
           COALESCE(ut.on_shelf,false),
           COALESCE(ut.on_wishlist,false),
           COALESCE(ut.on_favourite,false)
    FROM public.user_tools ut
    WHERE ut.linked_brand_product_id IN (SELECT id FROM prods)
  ),
  raw AS (
    SELECT
      pr.id,
      pr.name,
      (SELECT count(DISTINCT o.user_id) FROM owned o WHERE o.pid = pr.id AND o.on_shelf)::int AS shelf_raw,
      (SELECT count(DISTINCT o.user_id) FROM owned o WHERE o.pid = pr.id AND o.on_wishlist)::int AS wish_raw,
      (SELECT count(DISTINCT o.user_id) FROM owned o WHERE o.pid = pr.id AND o.on_favourite)::int AS fav_raw
    FROM prods pr
  )
  SELECT
    r.id,
    r.name,
    CASE WHEN r.shelf_raw >= v_min THEN r.shelf_raw ELSE NULL END,
    CASE WHEN r.wish_raw  >= v_min THEN r.wish_raw  ELSE NULL END,
    CASE WHEN r.fav_raw   >= v_min THEN r.fav_raw   ELSE NULL END,
    (r.shelf_raw < v_min AND r.wish_raw < v_min AND r.fav_raw < v_min),
    v_min
  FROM raw r
  ORDER BY r.name;
END;
$function$;