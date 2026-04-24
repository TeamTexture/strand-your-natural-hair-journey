-- Contact form submissions
CREATE TABLE public.contact_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  was_authenticated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (signed-in or not) can submit a message via the contact form.
CREATE POLICY "Anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies → no one can read or modify rows from the app.
-- Messages remain visible only via the Lovable Cloud database view.

CREATE INDEX idx_contact_messages_created_at ON public.contact_messages(created_at DESC);