
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cover_image_path text;

CREATE POLICY "Admins manage event covers"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'event-covers' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'event-covers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read event covers"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-covers');
