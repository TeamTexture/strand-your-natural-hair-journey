ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS treatment_checkin_reminders boolean NOT NULL DEFAULT false;