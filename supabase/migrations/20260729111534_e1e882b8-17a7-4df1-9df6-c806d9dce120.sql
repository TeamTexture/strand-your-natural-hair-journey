CREATE POLICY "Admins manage directory listings"
ON public.professionals_directory
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals_directory TO authenticated;
GRANT ALL ON public.professionals_directory TO service_role;