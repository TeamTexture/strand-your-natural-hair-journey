import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { onboardingStatusKey } from "@/hooks/useOnboardingStatus";
import { getConsumerOnboardingStatus } from "@/lib/consumerOnboarding";
import { getOnboardingNextPath } from "@/lib/onboardingDecision";
import { clearResumeLock, setResumeLock } from "@/lib/onboardingLock";

/**
 * Re-read the durable rows after a save, update the shared cache, then decide
 * the next route from that exact same result. This prevents stale query data or
 * the navigation-only resume lock from deciding whether onboarding is done.
 */
export function useOnboardingCompletion() {
  const { user } = useAuth();
  const { hasAccess } = useConsumerSubscription();
  const queryClient = useQueryClient();

  const resolveNextPath = useCallback(async () => {
    if (!user?.id) return "/auth";
    const status = await getConsumerOnboardingStatus(user.id);
    queryClient.setQueryData(onboardingStatusKey(user.id), status);

    if (status.dataComplete) clearResumeLock();
    else if (status.healthComplete) setResumeLock();

    return getOnboardingNextPath(status, hasAccess);
  }, [hasAccess, queryClient, user?.id]);

  return { resolveNextPath };
}
