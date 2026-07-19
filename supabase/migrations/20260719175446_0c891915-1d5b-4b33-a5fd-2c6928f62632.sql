ALTER TABLE public.blood_panels
  ADD COLUMN IF NOT EXISTS test_type text,
  ADD COLUMN IF NOT EXISTS lab_name text;