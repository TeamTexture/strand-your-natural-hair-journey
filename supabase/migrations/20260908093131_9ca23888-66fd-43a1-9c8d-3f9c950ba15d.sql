ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

COMMENT ON COLUMN public.appointments.review_request_sent_at IS
  'Set once when the post-appointment review request (in-app notification + email) has been sent. Idempotency guard for the appointment-review-requests scheduled function.';