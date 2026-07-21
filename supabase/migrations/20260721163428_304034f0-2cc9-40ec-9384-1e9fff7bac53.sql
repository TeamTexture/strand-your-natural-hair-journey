CREATE OR REPLACE FUNCTION public.has_active_consumer_subscription(_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    NOT public.is_access_restricted(_user)
    AND NOT (
      public.has_role(_user, 'brand')
      AND NOT public.has_role(_user, 'admin')
      AND NOT public.has_role(_user, 'professional')
    )
    AND (
      COALESCE((SELECT complimentary_access FROM public.profiles WHERE user_id = _user), false)
      OR public.has_role(_user, 'admin')
      OR public.has_role(_user, 'professional')
      OR EXISTS (
        SELECT 1 FROM public.consumer_subscriptions
        WHERE user_id = _user
          AND status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$function$;