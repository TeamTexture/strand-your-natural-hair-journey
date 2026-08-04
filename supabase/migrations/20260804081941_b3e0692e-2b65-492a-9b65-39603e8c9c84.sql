-- ─────────────────────────────────────────────────────────────
-- PHASE 1 — capability claims vs verification on pro_profiles
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS is_doctor_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmc_number text,
  ADD COLUMN IF NOT EXISTS is_doctor_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doctor_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS doctor_verified_by uuid,
  ADD COLUMN IF NOT EXISTS doctor_claim_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS doctor_review_note text,
  ADD COLUMN IF NOT EXISTS can_take_bloods_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloods_setting text,
  ADD COLUMN IF NOT EXISTS can_take_bloods_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloods_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bloods_verified_by uuid,
  ADD COLUMN IF NOT EXISTS bloods_claim_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS bloods_review_note text;

ALTER TABLE public.pro_profiles
  DROP CONSTRAINT IF EXISTS pro_profiles_bloods_setting_chk,
  DROP CONSTRAINT IF EXISTS pro_profiles_doctor_claim_status_chk,
  DROP CONSTRAINT IF EXISTS pro_profiles_bloods_claim_status_chk;

ALTER TABLE public.pro_profiles
  ADD CONSTRAINT pro_profiles_bloods_setting_chk
    CHECK (bloods_setting IS NULL OR bloods_setting IN ('clinic', 'home', 'both')),
  ADD CONSTRAINT pro_profiles_doctor_claim_status_chk
    CHECK (doctor_claim_status IN ('none', 'pending', 'verified', 'rejected')),
  ADD CONSTRAINT pro_profiles_bloods_claim_status_chk
    CHECK (bloods_claim_status IN ('none', 'pending', 'verified', 'rejected'));

CREATE INDEX IF NOT EXISTS pro_profiles_doctor_verified_idx
  ON public.pro_profiles (is_doctor_verified) WHERE is_doctor_verified;
CREATE INDEX IF NOT EXISTS pro_profiles_bloods_verified_idx
  ON public.pro_profiles (can_take_bloods_verified) WHERE can_take_bloods_verified;

-- ── Audit log: who verified what, when, and the previous value.
CREATE TABLE IF NOT EXISTS public.pro_capability_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN ('doctor', 'bloods')),
  action text NOT NULL CHECK (action IN ('claimed', 'claim_updated', 'approved', 'rejected', 'revoked')),
  previous_value jsonb,
  new_value jsonb,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pro_capability_audit TO authenticated;
GRANT ALL ON public.pro_capability_audit TO service_role;

ALTER TABLE public.pro_capability_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read capability audit" ON public.pro_capability_audit;
CREATE POLICY "Admins read capability audit"
  ON public.pro_capability_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Pros read own capability audit" ON public.pro_capability_audit;
CREATE POLICY "Pros read own capability audit"
  ON public.pro_capability_audit FOR SELECT TO authenticated
  USING (auth.uid() = pro_user_id);

CREATE INDEX IF NOT EXISTS pro_capability_audit_pro_idx
  ON public.pro_capability_audit (pro_user_id, created_at DESC);

-- ── A claim is NEVER a credential. Professionals may write their claims;
--    only admin / service_role may move a verification column. Anything the
--    pro tries to set on a verified/status column is reverted to OLD here.
CREATE OR REPLACE FUNCTION public.pro_profiles_lock_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  privileged boolean;
BEGIN
  privileged := (current_setting('role', true) = 'service_role')
             OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role));

  IF NOT privileged THEN
    NEW.is_doctor_verified       := OLD.is_doctor_verified;
    NEW.doctor_verified_at       := OLD.doctor_verified_at;
    NEW.doctor_verified_by       := OLD.doctor_verified_by;
    NEW.doctor_review_note       := OLD.doctor_review_note;
    NEW.can_take_bloods_verified := OLD.can_take_bloods_verified;
    NEW.bloods_verified_at       := OLD.bloods_verified_at;
    NEW.bloods_verified_by       := OLD.bloods_verified_by;
    NEW.bloods_review_note       := OLD.bloods_review_note;
    NEW.doctor_claim_status      := OLD.doctor_claim_status;
    NEW.bloods_claim_status      := OLD.bloods_claim_status;

    -- Re-derive claim status from the claim itself. A changed claim always
    -- drops back to pending and loses any existing verification.
    IF NEW.is_doctor_claimed IS DISTINCT FROM OLD.is_doctor_claimed
       OR COALESCE(NEW.gmc_number, '') IS DISTINCT FROM COALESCE(OLD.gmc_number, '') THEN
      IF NEW.is_doctor_claimed THEN
        NEW.doctor_claim_status := 'pending';
      ELSE
        NEW.doctor_claim_status := 'none';
      END IF;
      NEW.is_doctor_verified := false;
      NEW.doctor_verified_at := NULL;
      NEW.doctor_verified_by := NULL;
      NEW.doctor_review_note := NULL;
      INSERT INTO public.pro_capability_audit
        (pro_user_id, capability, action, previous_value, new_value, actor_id)
      VALUES (
        NEW.user_id, 'doctor',
        CASE WHEN OLD.doctor_claim_status = 'none' THEN 'claimed' ELSE 'claim_updated' END,
        jsonb_build_object('claimed', OLD.is_doctor_claimed, 'gmc_number', OLD.gmc_number,
                           'verified', OLD.is_doctor_verified, 'status', OLD.doctor_claim_status),
        jsonb_build_object('claimed', NEW.is_doctor_claimed, 'gmc_number', NEW.gmc_number,
                           'verified', false, 'status', NEW.doctor_claim_status),
        auth.uid()
      );
    END IF;

    IF NEW.can_take_bloods_claimed IS DISTINCT FROM OLD.can_take_bloods_claimed
       OR COALESCE(NEW.bloods_setting, '') IS DISTINCT FROM COALESCE(OLD.bloods_setting, '') THEN
      IF NEW.can_take_bloods_claimed THEN
        NEW.bloods_claim_status := 'pending';
      ELSE
        NEW.bloods_claim_status := 'none';
      END IF;
      NEW.can_take_bloods_verified := false;
      NEW.bloods_verified_at := NULL;
      NEW.bloods_verified_by := NULL;
      NEW.bloods_review_note := NULL;
      INSERT INTO public.pro_capability_audit
        (pro_user_id, capability, action, previous_value, new_value, actor_id)
      VALUES (
        NEW.user_id, 'bloods',
        CASE WHEN OLD.bloods_claim_status = 'none' THEN 'claimed' ELSE 'claim_updated' END,
        jsonb_build_object('claimed', OLD.can_take_bloods_claimed, 'setting', OLD.bloods_setting,
                           'verified', OLD.can_take_bloods_verified, 'status', OLD.bloods_claim_status),
        jsonb_build_object('claimed', NEW.can_take_bloods_claimed, 'setting', NEW.bloods_setting,
                           'verified', false, 'status', NEW.bloods_claim_status),
        auth.uid()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pro_profiles_lock_verification_trg ON public.pro_profiles;
CREATE TRIGGER pro_profiles_lock_verification_trg
BEFORE UPDATE ON public.pro_profiles
FOR EACH ROW EXECUTE FUNCTION public.pro_profiles_lock_verification();

-- New claims on INSERT land as pending, never verified.
CREATE OR REPLACE FUNCTION public.pro_profiles_claims_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (current_setting('role', true) = 'service_role'
          OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role))) THEN
    NEW.is_doctor_verified := false;
    NEW.doctor_verified_at := NULL;
    NEW.doctor_verified_by := NULL;
    NEW.can_take_bloods_verified := false;
    NEW.bloods_verified_at := NULL;
    NEW.bloods_verified_by := NULL;
    NEW.doctor_claim_status := CASE WHEN NEW.is_doctor_claimed THEN 'pending' ELSE 'none' END;
    NEW.bloods_claim_status := CASE WHEN NEW.can_take_bloods_claimed THEN 'pending' ELSE 'none' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pro_profiles_claims_on_insert_trg ON public.pro_profiles;
CREATE TRIGGER pro_profiles_claims_on_insert_trg
BEFORE INSERT ON public.pro_profiles
FOR EACH ROW EXECUTE FUNCTION public.pro_profiles_claims_on_insert();

-- ── Admin decision RPC: approve or reject EACH capability independently.
CREATE OR REPLACE FUNCTION public.set_pro_capability_verification(
  _pro uuid,
  _capability text,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev jsonb;
  pro_name text;
  cap_label text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may change capability verification';
  END IF;
  IF _capability NOT IN ('doctor', 'bloods') THEN
    RAISE EXCEPTION 'Unknown capability: %', _capability;
  END IF;

  IF _capability = 'doctor' THEN
    SELECT jsonb_build_object('verified', is_doctor_verified, 'status', doctor_claim_status,
                              'gmc_number', gmc_number, 'note', doctor_review_note)
      INTO prev FROM public.pro_profiles WHERE user_id = _pro;

    UPDATE public.pro_profiles SET
      is_doctor_verified = _approve,
      doctor_claim_status = CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
      doctor_verified_at = CASE WHEN _approve THEN now() ELSE NULL END,
      doctor_verified_by = CASE WHEN _approve THEN auth.uid() ELSE NULL END,
      doctor_review_note = _note,
      updated_at = now()
    WHERE user_id = _pro;
    cap_label := 'Doctor (GMC) verification';
  ELSE
    SELECT jsonb_build_object('verified', can_take_bloods_verified, 'status', bloods_claim_status,
                              'setting', bloods_setting, 'note', bloods_review_note)
      INTO prev FROM public.pro_profiles WHERE user_id = _pro;

    UPDATE public.pro_profiles SET
      can_take_bloods_verified = _approve,
      bloods_claim_status = CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
      bloods_verified_at = CASE WHEN _approve THEN now() ELSE NULL END,
      bloods_verified_by = CASE WHEN _approve THEN auth.uid() ELSE NULL END,
      bloods_review_note = _note,
      updated_at = now()
    WHERE user_id = _pro;
    cap_label := 'Blood-draw capability';
  END IF;

  IF prev IS NULL THEN
    RAISE EXCEPTION 'No professional profile for %', _pro;
  END IF;

  INSERT INTO public.pro_capability_audit
    (pro_user_id, capability, action, previous_value, new_value, note, actor_id)
  VALUES (
    _pro, _capability,
    CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    prev,
    jsonb_build_object('verified', _approve,
                       'status', CASE WHEN _approve THEN 'verified' ELSE 'rejected' END),
    _note, auth.uid()
  );

  INSERT INTO public.notifications (user_id, kind, actor_id, entity_type, entity_id, url, title, body)
  VALUES (
    _pro,
    CASE WHEN _approve THEN 'capability_approved' ELSE 'capability_rejected' END,
    auth.uid(), 'pro_capability', _pro, '/pro/profile',
    cap_label || (CASE WHEN _approve THEN ' approved' ELSE ' not approved' END),
    CASE WHEN _approve
      THEN cap_label || ' has been verified and now shows on your listing.'
      ELSE cap_label || ' was not approved.' || COALESCE(' Reason: ' || _note, '')
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_pro_capability_verification(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pro_capability_verification(uuid, text, boolean, text) TO authenticated;

-- ── Admins get told when a claim arrives.
CREATE OR REPLACE FUNCTION public.admin_notify_pro_capability_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.doctor_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.doctor_claim_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO public.admin_notifications (kind, entity_type, entity_id, actor_id, title, body, url)
    VALUES ('pro_capability_claim', 'pro_capability', NEW.user_id, NEW.user_id,
            'Doctor claim to verify',
            COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
              || ' claims GMC registration' || COALESCE(' (' || NEW.gmc_number || ')', '') || '.',
            '/admin/professionals?capability=doctor');
  END IF;

  IF NEW.bloods_claim_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.bloods_claim_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO public.admin_notifications (kind, entity_type, entity_id, actor_id, title, body, url)
    VALUES ('pro_capability_claim', 'pro_capability', NEW.user_id, NEW.user_id,
            'Blood-draw claim to verify',
            COALESCE(NULLIF(NEW.display_name, ''), 'A professional')
              || ' claims they can take bloods in person'
              || COALESCE(' (' || NEW.bloods_setting || ')', '') || '.',
            '/admin/professionals?capability=bloods');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_notify_pro_capability_claim_trg ON public.pro_profiles;
CREATE TRIGGER admin_notify_pro_capability_claim_trg
AFTER INSERT OR UPDATE ON public.pro_profiles
FOR EACH ROW EXECUTE FUNCTION public.admin_notify_pro_capability_claim();

-- ─────────────────────────────────────────────────────────────
-- PHASE 2 — blood test vendor registry (ships empty + inactive)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blood_test_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  short_description text,
  panel_name text,
  markers_covered text[] NOT NULL DEFAULT '{}',
  price_from numeric,
  currency text NOT NULL DEFAULT 'GBP',
  url text,
  affiliate_url text,
  regions_served text[] NOT NULL DEFAULT '{}',
  at_home boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blood_test_vendors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blood_test_vendors TO authenticated;
GRANT ALL ON public.blood_test_vendors TO service_role;

ALTER TABLE public.blood_test_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read active vendors" ON public.blood_test_vendors;
CREATE POLICY "Members read active vendors"
  ON public.blood_test_vendors FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage vendors" ON public.blood_test_vendors;
CREATE POLICY "Admins manage vendors"
  ON public.blood_test_vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS blood_test_vendors_active_idx
  ON public.blood_test_vendors (is_active, sort_order);
CREATE INDEX IF NOT EXISTS blood_test_vendors_markers_idx
  ON public.blood_test_vendors USING gin (markers_covered);

DROP TRIGGER IF EXISTS blood_test_vendors_set_updated_at ON public.blood_test_vendors;
CREATE TRIGGER blood_test_vendors_set_updated_at
BEFORE UPDATE ON public.blood_test_vendors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();