
-- 1) pro-photos storage: scope read to owner folder OR published+non-suspended pro
DROP POLICY IF EXISTS "Pros manage own photos - read" ON storage.objects;
CREATE POLICY "Pro photos read owner or published"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
  bucket_id = 'pro-photos'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.pro_profiles pp
      WHERE pp.user_id::text = (storage.foldername(name))[1]
        AND pp.is_published = true
        AND pp.suspended_at IS NULL
    )
  )
);

-- 2) platform_settings: restrict reads to authenticated only
DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated reads platform settings"
ON public.platform_settings FOR SELECT
TO authenticated
USING (true);

-- 3) SECURITY DEFINER functions: revoke EXECUTE from PUBLIC and anon.
--    Trigger functions: also revoke from authenticated (called only by trigger owner).
--    RLS-helper functions (has_role, has_active_*, is_access_restricted, has_active_client_access):
--    keep authenticated so RLS policies can invoke them.

-- Trigger functions (called only by the database engine as SECURITY DEFINER definer)
REVOKE ALL ON FUNCTION public.assign_default_consumer_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_favourites_board() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_user_products_on_wash_day() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brand_placement_no_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debounce_user_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_complimentary_access_admin_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_new_pro_application() FROM PUBLIC, anon, authenticated;

-- RPCs callable by authenticated users (server-side authorization inside)
REVOKE ALL ON FUNCTION public.accept_enquiry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_member_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_member_emails() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_pro_usage() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_pro_usage_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_restrict_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unrestrict_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_brand_offer_revision(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_pro_application(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brand_catalogue_items(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brand_offer_totals(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_brand_offer_stat(uuid, brand_placement_slot, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_brand_offer_revision(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_brand_offer_revision(uuid) FROM PUBLIC, anon;

-- Ensure authenticated + service_role still hold EXECUTE where required
GRANT EXECUTE ON FUNCTION public.accept_enquiry(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_member_activity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_member_emails() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_pro_usage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pro_usage_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_restrict_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unrestrict_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_brand_offer_revision(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_pro_application(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_catalogue_items(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_offer_totals(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_brand_offer_stat(uuid, brand_placement_slot, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_brand_offer_revision(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_brand_offer_revision(uuid) TO authenticated, service_role;

-- RLS helpers: keep authenticated (used in policies) but drop anon and PUBLIC
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_pro_subscription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_consumer_subscription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_brand_subscription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_client_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_access_restricted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_pro_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_consumer_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_brand_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_client_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_access_restricted(uuid) TO authenticated, service_role;
