CREATE OR REPLACE FUNCTION public.can_write_consumer_registration(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user IS NOT NULL
    AND auth.uid() = _user
    AND NOT public.is_access_restricted(_user)
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
  _heritage text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_write_consumer_registration(_uid) THEN
    RAISE EXCEPTION 'Registration is not available for this account';
  END IF;

  IF length(btrim(coalesce(_display_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  IF length(btrim(coalesce(_postcode, ''))) = 0 THEN
    RAISE EXCEPTION 'Postcode is required';
  END IF;

  IF length(btrim(coalesce(_country, ''))) = 0 THEN
    RAISE EXCEPTION 'Country is required';
  END IF;

  INSERT INTO public.profiles (
    user_id,
    display_name,
    phone_number,
    birth_year,
    postcode,
    country,
    heritage
  ) VALUES (
    _uid,
    btrim(_display_name),
    nullif(btrim(coalesce(_phone_number, '')), ''),
    _birth_year,
    upper(btrim(_postcode)),
    btrim(_country),
    coalesce(_heritage, ARRAY[]::text[])
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      phone_number = EXCLUDED.phone_number,
      birth_year = EXCLUDED.birth_year,
      postcode = EXCLUDED.postcode,
      country = EXCLUDED.country,
      heritage = EXCLUDED.heritage;
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
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_write_consumer_registration(_uid) THEN
    RAISE EXCEPTION 'Registration is not available for this account';
  END IF;

  IF _avatar_url IS NOT NULL
     AND _avatar_url NOT LIKE (_uid::text || '/%') THEN
    RAISE EXCEPTION 'Avatar path is not allowed';
  END IF;

  INSERT INTO public.profiles (user_id, avatar_url)
  VALUES (_uid, _avatar_url)
  ON CONFLICT (user_id) DO UPDATE
  SET avatar_url = EXCLUDED.avatar_url;
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

DROP POLICY IF EXISTS "Members write own onboarding drafts" ON public.onboarding_drafts;
DROP POLICY IF EXISTS "Members update own onboarding drafts" ON public.onboarding_drafts;
DROP POLICY IF EXISTS "Members delete own onboarding drafts" ON public.onboarding_drafts;

CREATE POLICY "Members write own onboarding drafts"
ON public.onboarding_drafts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    draft_key = 'profile-step-1'
    OR public.can_write_consumer_onboarding(user_id)
  )
);

CREATE POLICY "Members update own onboarding drafts"
ON public.onboarding_drafts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND (
    draft_key = 'profile-step-1'
    OR public.can_write_consumer_onboarding(user_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    draft_key = 'profile-step-1'
    OR public.can_write_consumer_onboarding(user_id)
  )
);

CREATE POLICY "Members delete own onboarding drafts"
ON public.onboarding_drafts
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND (
    draft_key = 'profile-step-1'
    OR public.can_write_consumer_onboarding(user_id)
  )
);