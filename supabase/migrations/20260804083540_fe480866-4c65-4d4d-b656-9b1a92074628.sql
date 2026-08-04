-- 1. Professional discount fields (booking_url already exists on pro_profiles)
ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_description text,
  ADD COLUMN IF NOT EXISTS discount_active boolean NOT NULL DEFAULT false;

-- 2. Outbound booking-link click log. Phase 2's return prompt reads from this.
CREATE TABLE public.pro_booking_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  discount_code_shown text,
  booking_url_at_click text NOT NULL,
  prompted_at timestamptz,
  outcome text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_booking_clicks_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('booked', 'not_booked', 'dismissed'))
);

CREATE INDEX pro_booking_clicks_user_idx
  ON public.pro_booking_clicks (user_id, clicked_at DESC);
CREATE INDEX pro_booking_clicks_pro_idx
  ON public.pro_booking_clicks (professional_id, clicked_at DESC);
CREATE INDEX pro_booking_clicks_pending_prompt_idx
  ON public.pro_booking_clicks (user_id, clicked_at DESC)
  WHERE prompted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.pro_booking_clicks TO authenticated;
GRANT ALL ON public.pro_booking_clicks TO service_role;

ALTER TABLE public.pro_booking_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own booking clicks"
  ON public.pro_booking_clicks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Pros read clicks for their listing"
  ON public.pro_booking_clicks FOR SELECT TO authenticated
  USING (professional_id = auth.uid());

CREATE POLICY "Admins read all booking clicks"
  ON public.pro_booking_clicks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users log own booking clicks"
  ON public.pro_booking_clicks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Only the owning user updates their booking click"
  ON public.pro_booking_clicks FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER pro_booking_clicks_set_updated_at
  BEFORE UPDATE ON public.pro_booking_clicks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. On acceptance, post the discount into the thread so the user can scroll back to it.
CREATE OR REPLACE FUNCTION public.accept_enquiry(_enquiry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enq public.pro_enquiries%ROWTYPE;
  access_id uuid;
  new_thread_id uuid;
  pro public.pro_profiles%ROWTYPE;
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

  INSERT INTO public.chat_threads (enquiry_id, pro_user_id, consumer_id)
    VALUES (enq.id, enq.pro_user_id, enq.consumer_id)
    ON CONFLICT (enquiry_id) DO UPDATE SET pro_user_id = EXCLUDED.pro_user_id
    RETURNING id INTO new_thread_id;

  INSERT INTO public.chat_messages (thread_id, sender_id, kind, body)
    VALUES (
      new_thread_id,
      NULL,
      'system',
      'Enquiry accepted — you can now message directly.'
    );

  SELECT * INTO pro FROM public.pro_profiles WHERE user_id = enq.pro_user_id;

  IF pro.discount_active IS TRUE
     AND coalesce(btrim(pro.discount_code), '') <> '' THEN
    INSERT INTO public.chat_messages (thread_id, sender_id, kind, body, meta)
      VALUES (
        new_thread_id,
        NULL,
        'system',
        'Your STRAND discount with ' || coalesce(pro.display_name, 'this professional')
          || ': ' || btrim(pro.discount_code)
          || CASE
               WHEN coalesce(btrim(pro.discount_description), '') <> ''
               THEN ' — ' || btrim(pro.discount_description)
               ELSE ''
             END,
        jsonb_build_object(
          'discount_code', btrim(pro.discount_code),
          'discount_description', nullif(btrim(coalesce(pro.discount_description, '')), ''),
          'pro_name', pro.display_name
        )
      );
  END IF;

  RETURN access_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.accept_enquiry(uuid) FROM anon;