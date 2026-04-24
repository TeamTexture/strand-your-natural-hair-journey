DROP POLICY IF EXISTS "Anyone can submit a contact message" ON public.contact_messages;

CREATE POLICY "Anyone can submit a valid contact message"
ON public.contact_messages
FOR INSERT
WITH CHECK (
  char_length(name) BETWEEN 1 AND 120
  AND char_length(subject) BETWEEN 1 AND 200
  AND char_length(message) BETWEEN 5 AND 4000
  AND email LIKE '%@%'
  AND char_length(email) BETWEEN 5 AND 254
  AND (phone IS NULL OR char_length(phone) <= 40)
  -- was_authenticated flag must match actual auth state (prevents spoofing)
  AND was_authenticated = (auth.uid() IS NOT NULL)
  -- If signed in, user_id must match; if not signed in, user_id must be null
  AND (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  )
);