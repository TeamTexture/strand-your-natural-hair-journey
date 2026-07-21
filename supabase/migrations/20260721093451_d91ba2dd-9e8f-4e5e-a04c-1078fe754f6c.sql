
-- Enquiry status enum
DO $$ BEGIN
  CREATE TYPE public.pro_enquiry_status AS ENUM ('pending','accepted','declined','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pro_enquiries
CREATE TABLE public.pro_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pro_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  share_passport_consent boolean NOT NULL DEFAULT false,
  status public.pro_enquiry_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pro_enquiries_consumer ON public.pro_enquiries(consumer_id);
CREATE INDEX idx_pro_enquiries_pro ON public.pro_enquiries(pro_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_enquiries TO authenticated;
GRANT ALL ON public.pro_enquiries TO service_role;
ALTER TABLE public.pro_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consumers read own enquiries"
  ON public.pro_enquiries FOR SELECT TO authenticated
  USING (auth.uid() = consumer_id);

CREATE POLICY "Pros read enquiries addressed to them"
  ON public.pro_enquiries FOR SELECT TO authenticated
  USING (auth.uid() = pro_user_id);

CREATE POLICY "Admins read all enquiries"
  ON public.pro_enquiries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Consumer inserts own enquiry, must consent
CREATE POLICY "Consumers create own enquiries"
  ON public.pro_enquiries FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = consumer_id
    AND share_passport_consent = true
    AND status = 'pending'
  );

-- Consumer withdraws own pending enquiry
CREATE POLICY "Consumers withdraw own enquiries"
  ON public.pro_enquiries FOR UPDATE TO authenticated
  USING (auth.uid() = consumer_id)
  WITH CHECK (auth.uid() = consumer_id AND status IN ('pending','withdrawn'));

-- Pros update status (accept/decline). Accepting is normally done via
-- accept_enquiry() SECURITY DEFINER function; this policy also permits
-- direct declines with reason.
CREATE POLICY "Pros update enquiries addressed to them"
  ON public.pro_enquiries FOR UPDATE TO authenticated
  USING (auth.uid() = pro_user_id)
  WITH CHECK (auth.uid() = pro_user_id AND status IN ('accepted','declined'));

CREATE TRIGGER set_pro_enquiries_updated_at
  BEFORE UPDATE ON public.pro_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pro_client_access (consent record)
CREATE TABLE public.pro_client_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enquiry_id uuid REFERENCES public.pro_enquiries(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pro_client_access_active_unique
  ON public.pro_client_access(pro_user_id, consumer_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_pro_client_access_pro ON public.pro_client_access(pro_user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_pro_client_access_consumer ON public.pro_client_access(consumer_id) WHERE revoked_at IS NULL;

GRANT SELECT, UPDATE ON public.pro_client_access TO authenticated;
GRANT ALL ON public.pro_client_access TO service_role;
ALTER TABLE public.pro_client_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consumers read own access records"
  ON public.pro_client_access FOR SELECT TO authenticated
  USING (auth.uid() = consumer_id);

CREATE POLICY "Pros read own access records"
  ON public.pro_client_access FOR SELECT TO authenticated
  USING (auth.uid() = pro_user_id);

CREATE POLICY "Admins read all access records"
  ON public.pro_client_access FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Consumers revoke their own access (set revoked_at). Cannot un-revoke.
CREATE POLICY "Consumers revoke own access"
  ON public.pro_client_access FOR UPDATE TO authenticated
  USING (auth.uid() = consumer_id)
  WITH CHECK (auth.uid() = consumer_id AND revoked_at IS NOT NULL);

CREATE TRIGGER set_pro_client_access_updated_at
  BEFORE UPDATE ON public.pro_client_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: is there an active (non-revoked) consent row?
CREATE OR REPLACE FUNCTION public.has_active_client_access(_pro uuid, _consumer uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pro_client_access
    WHERE pro_user_id = _pro
      AND consumer_id = _consumer
      AND revoked_at IS NULL
  )
$$;

-- Accept enquiry: caller must be the pro AND have active subscription.
-- Inserts consent row, marks enquiry accepted.
CREATE OR REPLACE FUNCTION public.accept_enquiry(_enquiry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enq public.pro_enquiries%ROWTYPE;
  access_id uuid;
BEGIN
  SELECT * INTO enq FROM public.pro_enquiries WHERE id = _enquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry not found';
  END IF;
  IF enq.pro_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the addressed professional can accept this enquiry';
  END IF;
  IF NOT public.has_active_pro_subscription(auth.uid()) THEN
    RAISE EXCEPTION 'An active STRAND Pro subscription is required to accept enquiries';
  END IF;
  IF enq.status <> 'pending' THEN
    RAISE EXCEPTION 'Enquiry is no longer pending';
  END IF;
  IF enq.share_passport_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Enquiry lacks passport consent';
  END IF;

  UPDATE public.pro_enquiries
    SET status = 'accepted', responded_at = now()
    WHERE id = _enquiry_id;

  INSERT INTO public.pro_client_access (pro_user_id, consumer_id, enquiry_id)
    VALUES (enq.pro_user_id, enq.consumer_id, enq.id)
    ON CONFLICT (pro_user_id, consumer_id) WHERE revoked_at IS NULL
    DO UPDATE SET enquiry_id = EXCLUDED.enquiry_id
    RETURNING id INTO access_id;

  RETURN access_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_enquiry(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_enquiry(uuid) TO authenticated;
