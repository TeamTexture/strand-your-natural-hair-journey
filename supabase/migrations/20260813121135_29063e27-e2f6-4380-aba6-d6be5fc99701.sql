INSERT INTO public.platform_settings (key, value)
VALUES ('admin_notification_email', '"paige.lewin@gmail.com"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '"paige.lewin@gmail.com"'::jsonb
WHERE public.platform_settings.value IS NULL
   OR public.platform_settings.value::text IN ('""', 'null');