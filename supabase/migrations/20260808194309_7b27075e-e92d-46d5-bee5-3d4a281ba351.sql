-- 1) Needed for the fee-free admin override's idempotent day inserts.
delete from public.brand_offer_placements p
using public.brand_offer_placements q
where p.offer_id = q.offer_id
  and p.slot = q.slot
  and p.placement_date = q.placement_date
  and p.ctid > q.ctid;

create unique index if not exists brand_offer_placements_offer_slot_date_key
  on public.brand_offer_placements (offer_id, slot, placement_date);

-- 2) Dedicated audit trail for admin overrides.
create table if not exists public.brand_offer_admin_overrides (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.brand_offers(id) on delete cascade,
  admin_user_id uuid not null,
  targeting_changed boolean not null default false,
  placement_changed boolean not null default false,
  slots text[] ,
  starts_on date,
  ends_on date,
  placements_added integer not null default 0,
  placements_removed integer not null default 0,
  fee_charged_pence integer not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.brand_offer_admin_overrides to authenticated;
grant all on public.brand_offer_admin_overrides to service_role;
alter table public.brand_offer_admin_overrides enable row level security;

drop policy if exists "Admins read offer override audit" on public.brand_offer_admin_overrides;
create policy "Admins read offer override audit"
  on public.brand_offer_admin_overrides for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index if not exists brand_offer_admin_overrides_offer_idx
  on public.brand_offer_admin_overrides (offer_id, created_at desc);

-- 3) Point the override function at the real audit table.
create or replace function public.admin_override_brand_offer(
  _offer_id uuid,
  _targeting jsonb default null,
  _slots public.brand_placement_slot[] default null,
  _starts_on date default null,
  _ends_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.brand_offers%ROWTYPE;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_start date;
  v_end date;
  v_slots public.brand_placement_slot[];
  v_day date;
  v_slot public.brand_placement_slot;
  v_added int := 0;
  v_removed int := 0;
  v_targeting_changed boolean := false;
  v_placement_changed boolean := false;
  v_paid_total int;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only';
  end if;

  select * into o from public.brand_offers where id = _offer_id;
  if o.id is null then raise exception 'Offer not found'; end if;

  -- Audience: '{}'::jsonb means broad (no targeting); NULL leaves it unchanged.
  if _targeting is not null then
    delete from public.brand_offer_targeting where offer_id = _offer_id;
    if _targeting <> '{}'::jsonb then
      insert into public.brand_offer_targeting (offer_id, attribute_key, value_code)
      select _offer_id, e.key, v.value_code
      from jsonb_each(_targeting) e
      cross join lateral (select jsonb_array_elements_text(e.value) as value_code) v
      join public.ad_targeting_attributes a
        on a.attribute_key = e.key and a.value_code = v.value_code
      on conflict do nothing;
    end if;
    v_targeting_changed := true;
  end if;

  -- Placement: slots and/or window.
  if _slots is not null or _starts_on is not null or _ends_on is not null then
    v_start := coalesce(_starts_on, o.starts_on, v_today);
    v_end := coalesce(_ends_on, o.ends_on, v_start);
    if v_end < v_start then raise exception 'End date is before the start date'; end if;

    v_slots := coalesce(
      _slots,
      (select array_agg(distinct slot) from public.brand_offer_placements where offer_id = _offer_id)
    );
    if v_slots is null or array_length(v_slots, 1) is null then
      raise exception 'At least one placement slot is required';
    end if;

    with removed as (
      delete from public.brand_offer_placements p
      where p.offer_id = _offer_id
        and p.placement_date >= v_today
        and (
          p.placement_date < v_start
          or p.placement_date > v_end
          or not (p.slot = any (v_slots))
        )
      returning 1
    )
    select count(*) into v_removed from removed;

    v_day := greatest(v_start, v_today);
    while v_day <= v_end loop
      foreach v_slot in array v_slots loop
        insert into public.brand_offer_placements (offer_id, slot, placement_date, daily_rate_pence)
        values (_offer_id, v_slot, v_day, 0)
        on conflict (offer_id, slot, placement_date) do nothing;
        if found then v_added := v_added + 1; end if;
      end loop;
      v_day := v_day + 1;
    end loop;

    update public.brand_offers
      set starts_on = v_start, ends_on = v_end, updated_at = now()
    where id = _offer_id;
    v_placement_changed := true;
  end if;

  -- No fees, ever: the total can only fall, and admin-added days cost nothing.
  select coalesce(sum(daily_rate_pence), 0)::int into v_paid_total
  from public.brand_offer_placements where offer_id = _offer_id;

  update public.brand_offers
    set total_price_pence = least(total_price_pence, v_paid_total),
        targeting_changed_at = case when v_targeting_changed then now() else targeting_changed_at end,
        updated_at = now()
  where id = _offer_id;

  perform public.resolve_ad_offer_audience(_offer_id);

  insert into public.brand_offer_admin_overrides (
    offer_id, admin_user_id, targeting_changed, placement_changed, slots,
    starts_on, ends_on, placements_added, placements_removed, fee_charged_pence
  ) values (
    _offer_id, auth.uid(), v_targeting_changed, v_placement_changed,
    (select array_agg(s::text) from unnest(coalesce(v_slots, '{}'::public.brand_placement_slot[])) s),
    v_start, v_end, v_added, v_removed, 0
  );

  return jsonb_build_object(
    'targeting_changed', v_targeting_changed,
    'placement_changed', v_placement_changed,
    'placements_added', v_added,
    'placements_removed', v_removed,
    'total_price_pence', (select total_price_pence from public.brand_offers where id = _offer_id)
  );
end;
$$;

revoke all on function public.admin_override_brand_offer(uuid, jsonb, public.brand_placement_slot[], date, date) from public, anon;
grant execute on function public.admin_override_brand_offer(uuid, jsonb, public.brand_placement_slot[], date, date) to authenticated;