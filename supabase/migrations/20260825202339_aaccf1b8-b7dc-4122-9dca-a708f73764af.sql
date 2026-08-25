DROP POLICY IF EXISTS "Users upload own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar files" ON storage.objects;

DROP FUNCTION IF EXISTS public.save_consumer_avatar(text);
DROP FUNCTION IF EXISTS public.save_consumer_registration(text, text, integer, text, text, text[]);
DROP FUNCTION IF EXISTS public.can_write_consumer_registration(uuid);

CREATE OR REPLACE FUNCTION public.profiles_registration_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _old_basic_complete boolean;
  _registration_fields_only boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.can_write_consumer_onboarding(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  _old_basic_complete := (
    OLD.avatar_url IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.display_name, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.phone_number, '')), '') IS NOT NULL
    AND OLD.birth_year IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.postcode, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(OLD.country, '')), '') IS NOT NULL
  );

  _registration_fields_only :=
    (to_jsonb(NEW) - ARRAY[
      'avatar_url',
      'display_name',
      'phone_number',
      'birth_year',
      'postcode',
      'country',
      'heritage',
      'updated_at'
    ]) =
    (to_jsonb(OLD) - ARRAY[
      'avatar_url',
      'display_name',
      'phone_number',
      'birth_year',
      'postcode',
      'country',
      'heritage',
      'updated_at'
    ]);

  IF OLD.trial_offer_at IS NULL OR _old_basic_complete OR NOT _registration_fields_only THEN
    RAISE EXCEPTION 'Registration-only profile updates are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.profiles_registration_update_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_registration_update_guard ON public.profiles;
CREATE TRIGGER profiles_registration_update_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_registration_update_guard();

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND (
    public.can_write_consumer_onboarding(user_id)
    OR trial_offer_at IS NOT NULL
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.can_write_consumer_onboarding(user_id)
    OR trial_offer_at IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Users upload own avatar files" ON storage.objects;
CREATE POLICY "Users upload own avatar files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    public.can_write_consumer_onboarding(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.trial_offer_at IS NOT NULL
        AND (
          p.avatar_url IS NULL
          OR NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.phone_number, '')), '') IS NULL
          OR p.birth_year IS NULL
          OR NULLIF(BTRIM(COALESCE(p.postcode, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.country, '')), '') IS NULL
        )
    )
  )
);

DROP POLICY IF EXISTS "Users update own avatar files" ON storage.objects;
CREATE POLICY "Users update own avatar files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    public.can_write_consumer_onboarding(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.trial_offer_at IS NOT NULL
        AND (
          p.avatar_url IS NULL
          OR NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.phone_number, '')), '') IS NULL
          OR p.birth_year IS NULL
          OR NULLIF(BTRIM(COALESCE(p.postcode, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.country, '')), '') IS NULL
        )
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    public.can_write_consumer_onboarding(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.trial_offer_at IS NOT NULL
        AND (
          p.avatar_url IS NULL
          OR NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.phone_number, '')), '') IS NULL
          OR p.birth_year IS NULL
          OR NULLIF(BTRIM(COALESCE(p.postcode, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.country, '')), '') IS NULL
        )
    )
  )
);

DROP POLICY IF EXISTS "Users delete own avatar files" ON storage.objects;
CREATE POLICY "Users delete own avatar files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    public.can_write_consumer_onboarding(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.trial_offer_at IS NOT NULL
        AND (
          p.avatar_url IS NULL
          OR NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.phone_number, '')), '') IS NULL
          OR p.birth_year IS NULL
          OR NULLIF(BTRIM(COALESCE(p.postcode, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(p.country, '')), '') IS NULL
        )
    )
  )
);