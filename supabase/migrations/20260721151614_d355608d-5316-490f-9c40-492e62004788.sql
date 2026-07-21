
-- Extend the app_role enum with 'brand' in its own transaction step
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'brand';
