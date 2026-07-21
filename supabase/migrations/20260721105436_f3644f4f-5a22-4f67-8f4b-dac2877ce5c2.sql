-- 1. Extend pro_applications with payment tracking
ALTER TABLE public.pro_applications
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE INDEX IF NOT EXISTS idx_pro_applications_payment_confirmed
  ON public.pro_applications(payment_confirmed_at);

-- 2. Allow applicants to update their own pre-payment application
--    (so they can resume the draft form). Post-payment (payment_confirmed_at set)
--    the row becomes admin-only.
DROP POLICY IF EXISTS "Applicants update own draft application" ON public.pro_applications;
CREATE POLICY "Applicants update own draft application"
  ON public.pro_applications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND payment_confirmed_at IS NULL)
  WITH CHECK (auth.uid() = user_id AND payment_confirmed_at IS NULL);

-- 3. Notification trigger — only fire when payment is confirmed
CREATE OR REPLACE FUNCTION public.notify_admin_new_pro_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
  project_ref text;
BEGIN
  -- Only notify once, when payment is confirmed
  IF NEW.payment_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  project_ref := 'wibimeglifveruvtvaxe';
  fn_url := 'https://' || project_ref || '.supabase.co/functions/v1/notify-admin-application';

  BEGIN
    PERFORM extensions.http_post(
      url := fn_url,
      body := jsonb_build_object('application_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_pro_application failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_pro_application ON public.pro_applications;
CREATE TRIGGER trg_notify_admin_new_pro_application
  AFTER INSERT OR UPDATE OF payment_confirmed_at ON public.pro_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_pro_application();

-- 4. Backfill: existing applications from before payment-gating are treated as paid
UPDATE public.pro_applications
  SET payment_confirmed_at = COALESCE(payment_confirmed_at, created_at)
  WHERE payment_confirmed_at IS NULL;