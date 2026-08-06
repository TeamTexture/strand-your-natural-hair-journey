-- 1. New multi-entry challenges column.
ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS challenges text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Backfill from the singular column. Only non-null, non-blank values become
--    an entry; a null or whitespace-only challenge stays an empty array. No
--    entries are invented.
UPDATE public.user_goals
SET challenges = ARRAY[btrim(challenge)]
WHERE challenge IS NOT NULL
  AND btrim(challenge) <> ''
  AND cardinality(challenges) = 0;

-- 4. Keep the old column, marked deprecated. Not dropped in this change.
COMMENT ON COLUMN public.user_goals.challenge IS
  'DEPRECATED — superseded by user_goals.challenges (text[]). Retained for rollback only; do not read or write. Safe to drop once no reader remains.';

COMMENT ON COLUMN public.user_goals.challenges IS
  'What the member is struggling with (breakage, dryness, retaining length, time). Distinct from user_hair_profile.areas_of_concern, which records physical locations on the head. No minimum and no maximum; an empty array is a valid state.';

COMMENT ON COLUMN public.user_goals.challenge_voice_url IS
  'Storage path of the most recent challenge voice note (voicenotes bucket). Stays singular: the recording is an input method for the challenges array, not a per-challenge attachment.';