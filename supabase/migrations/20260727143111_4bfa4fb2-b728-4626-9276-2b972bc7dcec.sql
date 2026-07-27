DROP POLICY IF EXISTS "Applicants update own draft application" ON public.pro_applications;

CREATE POLICY "Applicants update own draft application"
ON public.pro_applications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND payment_confirmed_at IS NULL)
WITH CHECK (auth.uid() = user_id AND status = 'pending'::pro_application_status);