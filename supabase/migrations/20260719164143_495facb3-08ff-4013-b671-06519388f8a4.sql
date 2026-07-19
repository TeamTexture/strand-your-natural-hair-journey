ALTER TABLE public.blood_results DROP CONSTRAINT IF EXISTS blood_results_user_id_marker_key;
CREATE INDEX IF NOT EXISTS blood_results_user_marker_idx ON public.blood_results (user_id, marker);