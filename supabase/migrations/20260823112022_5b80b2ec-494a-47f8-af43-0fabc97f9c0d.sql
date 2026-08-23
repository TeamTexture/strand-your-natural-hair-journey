DROP INDEX IF EXISTS public.country_waitlist_user_id_key;
ALTER TABLE public.country_waitlist ADD CONSTRAINT country_waitlist_user_id_key UNIQUE (user_id);