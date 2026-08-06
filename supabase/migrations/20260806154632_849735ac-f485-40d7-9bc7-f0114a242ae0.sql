-- 1. Email log — proof of every send attempt.
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  template_key text NOT NULL,
  category text NOT NULL DEFAULT 'transactional',
  trigger_event text NOT NULL,
  related_table text,
  related_id uuid,
  subject text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text,
  error text,
  suppressed_reason text,
  idempotency_key text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_log_category_chk CHECK (category IN ('transactional','marketing')),
  CONSTRAINT email_log_status_chk CHECK (status IN ('queued','sent','failed','suppressed'))
);

CREATE UNIQUE INDEX email_log_idempotency_key_uidx
  ON public.email_log (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX email_log_created_at_idx ON public.email_log (created_at DESC);
CREATE INDEX email_log_recipient_idx ON public.email_log (recipient_email);
CREATE INDEX email_log_status_idx ON public.email_log (status);

GRANT SELECT ON public.email_log TO authenticated;
GRANT ALL ON public.email_log TO service_role;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read the email log"
  ON public.email_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Recipients can read their own email log"
  ON public.email_log FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE TRIGGER email_log_set_updated_at
  BEFORE UPDATE ON public.email_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Per-user email preferences. Marketing consent defaults OFF.
CREATE TABLE public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  wash_day_reminders boolean NOT NULL DEFAULT true,
  blood_test_due boolean NOT NULL DEFAULT true,
  forum_replies boolean NOT NULL DEFAULT true,
  enquiry_updates boolean NOT NULL DEFAULT true,
  appointment_reminders boolean NOT NULL DEFAULT true,
  brand_offers boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_preferences_unsubscribe_token_uidx
  ON public.email_preferences (unsubscribe_token);

GRANT SELECT, INSERT, UPDATE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own email preferences"
  ON public.email_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members create their own email preferences"
  ON public.email_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members update their own email preferences"
  ON public.email_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER email_preferences_set_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Global send flag — OFF.
INSERT INTO public.platform_settings (key, value)
  VALUES ('email_sending_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- 4. Track complimentary access expiry so the free term can be warned about.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS complimentary_access_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS complimentary_expiry_warned_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_complimentary_access_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.complimentary_access IS DISTINCT FROM OLD.complimentary_access
    OR NEW.complimentary_access_expires_at IS DISTINCT FROM OLD.complimentary_access_expires_at
  ) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change complimentary access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_complimentary_guard ON public.profiles;
CREATE TRIGGER profiles_complimentary_guard
  BEFORE UPDATE OF complimentary_access, complimentary_access_expires_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complimentary_access_admin_only();