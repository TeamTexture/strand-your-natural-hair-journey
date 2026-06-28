
DROP POLICY IF EXISTS "Anyone can view active professionals" ON public.professionals_directory;

CREATE POLICY "Authenticated users can view active professionals"
ON public.professionals_directory
FOR SELECT
TO authenticated
USING (is_active = true);

REVOKE ALL ON public.professionals_directory FROM anon, authenticated;
GRANT SELECT (
  id, name, title, type, clinic_name, address, postcode,
  instagram_handle, website_url, booking_url, bio, specialisms,
  discount_description, is_active, created_at
) ON public.professionals_directory TO authenticated;
GRANT ALL ON public.professionals_directory TO service_role;

CREATE POLICY "Users can view their own contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
