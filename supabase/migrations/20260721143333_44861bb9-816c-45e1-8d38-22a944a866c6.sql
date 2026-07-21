CREATE OR REPLACE FUNCTION public.has_active_pro_subscription(_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    NOT public.is_access_restricted(_pro)
    AND (
      public.has_role(_pro, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.pro_subscriptions
        WHERE pro_user_id = _pro
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$function$;