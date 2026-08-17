ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_tour_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS goals_prompt_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS hair_length_prompt_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS pro_tour_seen_at timestamptz;

UPDATE public.profiles
SET home_tour_seen_at = COALESCE(home_tour_seen_at, now()),
    goals_prompt_seen_at = COALESCE(goals_prompt_seen_at, now()),
    hair_length_prompt_seen_at = COALESCE(hair_length_prompt_seen_at, now()),
    pro_tour_seen_at = COALESCE(pro_tour_seen_at, now()),
    tips_level_prompted_at = COALESCE(tips_level_prompted_at, now())
WHERE onboarding_completed_at IS NOT NULL;