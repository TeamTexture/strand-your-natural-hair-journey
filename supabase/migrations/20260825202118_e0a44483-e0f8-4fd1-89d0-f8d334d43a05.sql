CREATE OR REPLACE FUNCTION public.can_write_consumer_registration(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.can_write_consumer_onboarding(_user)
    OR (
      _user IS NOT NULL
      AND NOT public.is_access_restricted(_user)
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = _user
          AND p.trial_offer_at IS NOT NULL
          AND (
            NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
            OR NULLIF(BTRIM(COALESCE(p.phone_number, '')), '') IS NULL
            OR p.birth_year IS NULL
            OR NULLIF(BTRIM(COALESCE(p.postcode, '')), '') IS NULL
            OR NULLIF(BTRIM(COALESCE(p.country, '')), '') IS NULL
          )
      )
      AND NOT COALESCE((SELECT p.complimentary_access FROM public.profiles p WHERE p.user_id = _user), false)
      AND NOT public.has_role(_user, 'admin')
      AND NOT public.has_role(_user, 'professional')
    )
$function$;

REVOKE ALL ON FUNCTION public.can_write_consumer_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_consumer_registration(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_consumer_registration(
  _display_name text,
  _phone_number text,
  _birth_year integer,
  _postcode text,
  _country text,
  _heritage text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _clean_name text := NULLIF(BTRIM(_display_name), '');
  _clean_phone text := NULLIF(BTRIM(_phone_number), '');
  _clean_postcode text := NULLIF(UPPER(BTRIM(_postcode)), '');
  _clean_country text := NULLIF(BTRIM(_country), '');
  _clean_heritage text[] := COALESCE(_heritage, '{}'::text[]);
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_write_consumer_registration(_user) THEN
    RAISE EXCEPTION 'Registration details are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  IF _clean_name IS NULL
    OR _clean_phone IS NULL
    OR _birth_year IS NULL
    OR _clean_postcode IS NULL
    OR _clean_country IS NULL THEN
    RAISE EXCEPTION 'Registration details are incomplete' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    display_name = _clean_name,
    phone_number = _clean_phone,
    birth_year = _birth_year,
    postcode = _clean_postcode,
    country = _clean_country,
    heritage = _clean_heritage,
    updated_at = now()
  WHERE user_id = _user;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      user_id,
      display_name,
      phone_number,
      birth_year,
      postcode,
      country,
      heritage,
      updated_at
    )
    VALUES (
      _user,
      _clean_name,
      _clean_phone,
      _birth_year,
      _clean_postcode,
      _clean_country,
      _clean_heritage,
      now()
    );
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_consumer_registration(text, text, integer, text, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.save_consumer_avatar(_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _clean_avatar text := NULLIF(BTRIM(_avatar_url), '');
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_write_consumer_registration(_user) THEN
    RAISE EXCEPTION 'Registration details are locked until membership is active' USING ERRCODE = '42501';
  END IF;

  IF _clean_avatar IS NOT NULL AND split_part(_clean_avatar, '/', 1) <> _user::text THEN
    RAISE EXCEPTION 'Avatar path must belong to the current member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET avatar_url = _clean_avatar, updated_at = now()
  WHERE user_id = _user;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, avatar_url, updated_at)
    VALUES (_user, _clean_avatar, now());
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.save_consumer_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_consumer_avatar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_consumer_avatar(text) TO service_role;

DROP POLICY IF EXISTS "Users upload own avatar files" ON storage.objects;
CREATE POLICY "Users upload own avatar files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_registration(auth.uid())
);

DROP POLICY IF EXISTS "Users update own avatar files" ON storage.objects;
CREATE POLICY "Users update own avatar files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_registration(auth.uid())
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_registration(auth.uid())
);

DROP POLICY IF EXISTS "Users delete own avatar files" ON storage.objects;
CREATE POLICY "Users delete own avatar files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.can_write_consumer_registration(auth.uid())
);