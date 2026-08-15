update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, now())
where user_id = '1105db22-5ac7-4ae6-85a1-bea48a5d7d71';