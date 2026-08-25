import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingCompletion } from "@/hooks/useOnboardingCompletion";
import { getConsumerOnboardingStatus, getSubscribePath } from "@/lib/consumerOnboarding";
import { getOnboardingRequirements } from "@/lib/onboardingDecision";

/**
 * The forward exit out of the optional blood-work flow.
 *
 * Blood work never gates payment, so a member who has met every requirement
 * must always be carried on to membership — never dead-ended, and never bounced
 * back to the resume screen. Everything she has already entered stays saved:
 * this only resolves a destination, it writes nothing.
 */
export function useMembershipExit() {
  const { user } = useAuth();
  const { resolveNextPath } = useOnboardingCompletion();

  const resolveMembershipPath = useCallback(async () => {
    const path = await resolveNextPath();
    // Belt and braces: if anything resolves her back to the pick-up screen while
    // her required data is in fact complete, send her to membership instead.
    if (path.startsWith("/onboarding/resume") && user?.id) {
      try {
        const status = await getConsumerOnboardingStatus(user.id);
        if (getOnboardingRequirements(status).coreComplete) return getSubscribePath();
      } catch {
        // Fall through to the resolved path on a read failure.
      }
    }
    return path;
  }, [resolveNextPath, user?.id]);

  return { resolveMembershipPath };
}
