
-- 1. Lock down SECURITY DEFINER trigger functions: triggers run as table owner,
-- so direct EXECUTE by API roles is unnecessary and unsafe.
REVOKE EXECUTE ON FUNCTION public.bump_user_products_on_wash_day() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_favourites_board() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_med_limit() FROM PUBLIC, anon, authenticated;

-- 2. Hide regulatory verification numbers from unauthenticated readers of the
-- public professionals directory. The directory remains publicly readable;
-- only the verification_number / verification_type columns are gated to
-- signed-in users (the in-app directory requires auth).
REVOKE SELECT ON public.professionals_directory FROM anon;
GRANT SELECT (
  id, name, title, type, clinic_name, address, postcode,
  instagram_handle, website_url, booking_url, bio, specialisms,
  discount_code, discount_description, is_active, created_at
) ON public.professionals_directory TO anon;
GRANT SELECT ON public.professionals_directory TO authenticated;

-- 3. Manuscript bucket is server-only (service role via edge functions).
-- Make that intent explicit with deny-all policies for API roles.
-- service_role bypasses RLS, so functions still have full access.
CREATE POLICY "Manuscript bucket is server-only (no SELECT)"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'manuscript' AND false);
CREATE POLICY "Manuscript bucket is server-only (no INSERT)"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'manuscript' AND false);
CREATE POLICY "Manuscript bucket is server-only (no UPDATE)"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'manuscript' AND false);
CREATE POLICY "Manuscript bucket is server-only (no DELETE)"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'manuscript' AND false);

-- 4. Moodboard images: add the missing UPDATE policy so users can replace
-- their own files in place.
CREATE POLICY "Users update own moodboard files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'moodboard-images' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'moodboard-images' AND (auth.uid())::text = (storage.foldername(name))[1]);
