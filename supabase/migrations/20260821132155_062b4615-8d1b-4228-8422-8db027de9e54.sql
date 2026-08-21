REVOKE ALL ON public.user_sensitivities FROM anon;
REVOKE ALL ON public.user_supplements FROM anon;
REVOKE ALL ON public.meal_cook_logs FROM anon;
REVOKE ALL ON public.pro_passport_visibility FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sensitivities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_supplements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_cook_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_passport_visibility TO authenticated;
GRANT ALL ON public.user_sensitivities TO service_role;
GRANT ALL ON public.user_supplements TO service_role;
GRANT ALL ON public.meal_cook_logs TO service_role;
GRANT ALL ON public.pro_passport_visibility TO service_role;