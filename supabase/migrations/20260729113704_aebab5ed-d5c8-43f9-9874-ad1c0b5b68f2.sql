ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tips_level_check;
ALTER TABLE public.profiles ALTER COLUMN tips_level DROP DEFAULT;
ALTER TABLE public.profiles
  ALTER COLUMN tips_level TYPE smallint
  USING (CASE
    WHEN tips_level = 'essential' THEN 2
    WHEN tips_level = 'detailed' THEN 3
    WHEN tips_level ~ '^[1-4]$' THEN tips_level::smallint
    ELSE 3 END);
ALTER TABLE public.profiles ALTER COLUMN tips_level SET DEFAULT 3;
ALTER TABLE public.profiles ALTER COLUMN tips_level SET NOT NULL;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tips_level_check CHECK (tips_level BETWEEN 1 AND 4);