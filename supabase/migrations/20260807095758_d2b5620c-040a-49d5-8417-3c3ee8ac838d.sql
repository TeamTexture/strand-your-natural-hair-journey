-- 1. Brands must never reach member identities behind interest.
drop policy if exists "Brand owner reads interest for own offers" on public.brand_offer_interest;

-- 2. Exact counts for the offer owner / admins. No user ids leave this function.
create or replace function public.brand_offer_interest_counts(_offer_ids uuid[])
returns table (offer_id uuid, total integer, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         count(i.id)::int,
         count(i.id) filter (
           where o.brand_last_interest_seen_at is null
              or i.created_at > o.brand_last_interest_seen_at
         )::int
  from public.brand_offers o
  left join public.brand_offer_interest i on i.offer_id = o.id
  where o.id = any(_offer_ids)
    and (o.brand_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  group by o.id
$$;

revoke all on function public.brand_offer_interest_counts(uuid[]) from public, anon;
grant execute on function public.brand_offer_interest_counts(uuid[]) to authenticated;

-- 3. Relaunch lineage + notification bookkeeping.
alter table public.brand_offers
  add column if not exists relaunched_from_offer_id uuid references public.brand_offers(id) on delete set null,
  add column if not exists relaunch_notified_at timestamptz;

-- 4. Duplicate an ended offer as a DRAFT. Never live, never paid, no dates.
create or replace function public.relaunch_brand_offer(_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.brand_offers;
  new_id uuid;
begin
  select * into src from public.brand_offers where id = _offer_id;
  if src.id is null then
    raise exception 'Offer not found';
  end if;
  if src.brand_user_id <> auth.uid() and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Not permitted';
  end if;

  insert into public.brand_offers (
    brand_user_id, owner_type, headline, body_copy, hero_image_path, external_url,
    discount_code, attached_pro_offer_id, attached_booking_url, currency,
    status, starts_on, ends_on, total_price_pence, relaunched_from_offer_id
  )
  values (
    src.brand_user_id, src.owner_type, src.headline, src.body_copy, src.hero_image_path,
    src.external_url, src.discount_code, src.attached_pro_offer_id, src.attached_booking_url,
    src.currency, 'draft', null, null, 0, coalesce(src.relaunched_from_offer_id, src.id)
  )
  returning id into new_id;

  insert into public.brand_products (
    offer_id, source_type, linked_product_id, source_url, name, description,
    image_urls, ingredients, external_url, position, kind, tool_kind,
    key_features, materials, brand_user_id, is_published, approval_status, ingredients_source
  )
  select new_id, source_type, linked_product_id, source_url, name, description,
         image_urls, ingredients, external_url, position, kind, tool_kind,
         key_features, materials, brand_user_id, false, 'pending', ingredients_source
  from public.brand_products
  where offer_id = _offer_id;

  insert into public.brand_offer_targeting (offer_id, attribute_key, value_code)
  select new_id, attribute_key, value_code
  from public.brand_offer_targeting
  where offer_id = _offer_id;

  return new_id;
end;
$$;

revoke all on function public.relaunch_brand_offer(uuid) from public, anon;
grant execute on function public.relaunch_brand_offer(uuid) to authenticated;