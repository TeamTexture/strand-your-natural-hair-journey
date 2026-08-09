CREATE POLICY "chat_images_read_participants"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND public.is_chat_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_images_insert_participants"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND owner = auth.uid()
    AND public.is_chat_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_images_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND owner = auth.uid());