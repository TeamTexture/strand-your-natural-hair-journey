-- 1. brand_blood_panels: members only
DROP POLICY IF EXISTS "Curated vendor panels are publicly readable" ON public.brand_blood_panels;
CREATE POLICY "Curated vendor panels readable by members"
ON public.brand_blood_panels FOR SELECT TO authenticated
USING (is_active AND brand_user_id IS NULL);
REVOKE ALL ON public.brand_blood_panels FROM anon;

-- 2. professionals_directory: authenticated only (an authenticated policy already exists)
DROP POLICY IF EXISTS "Anyone can view active professionals" ON public.professionals_directory;
REVOKE ALL ON public.professionals_directory FROM anon;

-- 3. pro_profiles: keep anon listing access but hide discount columns
REVOKE SELECT ON public.pro_profiles FROM anon;
GRANT SELECT (
  id, user_id, display_name, discipline, bio, services, location, postcode,
  contact_email, booking_url, website_url, instagram_handle, avatar_path,
  cover_path, photos, is_published, suspended_at, created_at, updated_at,
  business_phone, business_email, address_line1, address_line2, city,
  opening_hours, specialisms, listing_tier, referral_fee_percent,
  profile_review_status, review_note, submitted_at, reviewed_at, qualifications,
  is_doctor_claimed, gmc_number, is_doctor_verified, doctor_verified_at,
  doctor_verified_by, doctor_claim_status, doctor_review_note,
  can_take_bloods_claimed, bloods_setting, can_take_bloods_verified,
  bloods_verified_at, bloods_verified_by, bloods_claim_status,
  bloods_review_note, discount_active, salon_id
) ON public.pro_profiles TO anon;

-- 4. fixed search_path on the remaining function
CREATE OR REPLACE FUNCTION public.can_send_chat_message(_thread_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path = public
AS $function$
  select
    is_chat_participant(_thread_id, _user_id)
    and (
      exists (
        select 1 from consumer_subscriptions cs
        where cs.user_id = _user_id and cs.tier = 'plus' and cs.status = 'active'
      )
      or not exists (
        select 1
        from chat_threads t
        where t.id = _thread_id
          and t.pro_user_id is not null
          and (
            select min(a.appointment_date)
            from appointments a
            where a.user_id = _user_id
              and a.linked_pro_user_id = t.pro_user_id
              and a.cancelled_at is null
          ) < current_date
      )
    )
$function$;