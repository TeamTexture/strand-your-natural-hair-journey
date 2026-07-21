REVOKE ALL ON FUNCTION public.approve_brand_offer_revision(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_brand_offer_revision(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_brand_offer_revision(uuid, text, text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.withdraw_brand_offer_revision(uuid) FROM anon;