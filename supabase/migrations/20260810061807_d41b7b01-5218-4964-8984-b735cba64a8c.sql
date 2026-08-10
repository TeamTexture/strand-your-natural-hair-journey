-- Media consent is consent. It binds STRAND admins exactly as it binds
-- professionals: no role short-circuits it. An accepted assignment on the plan
-- plus media_sharing_consent = true plus no revocation is the only way in.
-- If a future support or safety case genuinely needs access to a member's
-- media, that must be a separate, deliberate and audited path — never an
-- implicit role check buried inside an RLS helper.
CREATE OR REPLACE FUNCTION public.has_media_access(_plan_id uuid, _pro uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _pro IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.treatment_plan_assignments a
      WHERE a.plan_id = _plan_id
        AND a.status = 'accepted'
        AND a.media_sharing_consent = true
        AND a.media_consent_revoked_at IS NULL
        AND (
          (a.assigner_type = 'professional' AND a.professional_id = _pro)
          OR
          (a.assigner_type = 'admin' AND a.assigner_user_id = _pro AND public.has_role(_pro, 'admin'))
        )
    )
    -- Caller must be a legitimate professional or admin at all. This is a
    -- gate in addition to consent, never an alternative to it.
    AND (public.has_role(_pro, 'admin') OR public.has_professional_undertaking(_pro))
$function$;