import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingCompletion } from "@/hooks/useOnboardingCompletion";
import {
  getConsumerAccessForUser,
  getConsumerOnboardingStatus,
  getPostPaymentPath,
  getSubscribePath,
} from "@/lib/consumerOnboarding";
import { getOnboardingRequirements } from "@/lib/onboardingDecision";

/**
 * The forward exit out of the optional blood-work flow.
 *
 * Blood work never gates payment, so a member who has met every requirement
 * must always be carried forward — never dead-ended, and never bounced back to
 * the resume screen. Everything she has already entered stays saved: this only
 * resolves a destination, it writes nothing.
 *
 * Payment happens at the START of the journey now (the trial paywall), so an
 * entitled member — `trialing` included — is carried to the app or her blood
 * analysis, never to /subscribe. /subscribe is only ever the answer for someone
 * with no live entitlement at all (trial ended, cancelled).
 */
export function useMembershipExit() {
  const { user } = useAuth();
  const { resolveNextPath } = useOnboardingCompletion();

  const resolveMembershipPath = useCallback(async () => {
    const path = await resolveNextPath();
    // Belt and braces: if anything resolves her back to the pick-up screen while
    // her required data is in fact complete, carry her forward instead.
    if (path.startsWith("/onboarding/resume") && user?.id) {
      try {
        const status = await getConsumerOnboardingStatus(user.id);
        if (getOnboardingRequirements(status).coreComplete) {
          const entitled = await getConsumerAccessForUser(user.id);
          const forward = getPostPaymentPath(status.bloodOnFile);
          return entitled ? "/onboarding/success" : getSubscribePath(forward);
        }
      } catch {
        // Fall through to the resolved path on a read failure.
      }
    }
    return path;
  }, [resolveNextPath, user?.id]);

  return { resolveMembershipPath };
}
