import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { myProfileKey } from "@/hooks/useMyProfile";
import { onboardingStatusKey } from "@/hooks/useOnboardingStatus";
import {
  getConsumerAccessForUser,
  getConsumerOnboardingStatus,
} from "@/lib/consumerOnboarding";
import { getOnboardingNextPath } from "@/lib/onboardingDecision";
import { clearResumeLock, setResumeLock } from "@/lib/onboardingLock";
import { requestTourAutostart } from "@/lib/firstRunTour";

/**
 * Re-read the durable rows after a save, update the shared cache, then decide
 * the next route from that exact same result. This prevents stale query data or
 * the navigation-only resume lock from deciding whether onboarding is done.
 *
 * ENTITLEMENT IS RE-READ FROM THE DATABASE, never taken from a hook that may
 * still be loading. Payment now happens at the START of the journey (the trial
 * paywall), so a member finishing the last onboarding step is already
 * `trialing` — a stale `hasAccess: false` here would have shown her a second
 * payment screen, which must never happen.
 */
export function useOnboardingCompletion() {
  const { user } = useAuth();
  const { hasAccess } = useConsumerSubscription();
  const { isAdmin, isProfessional, isBrand } = useRoles();
  const queryClient = useQueryClient();

  const resolveNextPath = useCallback(async () => {
    if (!user?.id) return "/auth";
    const status = await getConsumerOnboardingStatus(user.id);
    queryClient.setQueryData(onboardingStatusKey(user.id), status);

    if (status.dataComplete) clearResumeLock();
    else if (status.healthComplete) setResumeLock();

    let access = hasAccess;
    if (!access) {
      const roles = [
        isAdmin ? "admin" : null,
        isProfessional ? "professional" : null,
        isBrand ? "brand" : null,
      ].filter((r): r is string => !!r);
      try {
        access = await getConsumerAccessForUser(user.id, roles);
      } catch {
        /* fall back to the hook's answer on a read failure */
      }
    }

    if (status.dataComplete) {
      // The first-run tour is gated on `onboarding_completed_at` + the tour
      // flag, both read from the profiles row. Make sure the stamp is durable
      // and the cached row is refreshed BEFORE Home mounts, otherwise the tour
      // checks a row that has not caught up yet and silently never fires.
      if (!status.markedComplete) {
        await supabase
          .from("profiles")
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }
      await queryClient.invalidateQueries({ queryKey: myProfileKey(user.id) });
      if (access) requestTourAutostart();
    }

    return getOnboardingNextPath(status, access);
  }, [hasAccess, isAdmin, isBrand, isProfessional, queryClient, user?.id]);

  return { resolveNextPath };
}
