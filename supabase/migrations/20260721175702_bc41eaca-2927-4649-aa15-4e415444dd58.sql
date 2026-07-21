REVOKE ALL ON FUNCTION public.approve_brand_offer_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_brand_offer_revision(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_brand_offer_revision(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_brand_offer_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_brand_offer_revision(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_brand_offer_revision(uuid) TO authenticated;