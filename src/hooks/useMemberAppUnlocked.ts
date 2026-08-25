import { useEffect } from "react";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useRoles } from "@/hooks/useRoles";
import {
  rememberOnboardingComplete,
  wasOnboardingComplete,
} from "@/lib/onboardingResolved";

/**
 * Is this account allowed to see the full member app navigation?
 *
 * The route gates (OnboardingGate / Paid) already redirect a partially
 * onboarded member away from member screens, but a few screens are reachable
 * mid-onboarding by design (the professional directory, for example, is part of
 * the consultation step). Those screens were still rendering the hamburger menu
 * and the bottom tab bar, which advertised — and linked to — the whole paid app
 * to someone who had not finished hair characteristics, blood work or payment.
 *
 * The chrome now uses the same answer as the gates: navigation appears only
 * once the required data is complete AND membership access is live.
 *
 * Professionals, brands and admins are unaffected — their views have their own
 * navigation and are not behind consumer onboarding.
 */
/**
 * The single dataComplete answer used by the chrome gate, the resume screen and
 * every sub-flow that finishes one of the three required pieces. Completing one
 * requirement must never unlock the app or advance past the others — only this
 * being true does.
 *
 * THREE STATES, not two. `known: false` means "no answer yet" and callers must
 * render NOTHING in that case — never the incomplete-state UI.
 */
export function useMemberDataComplete(): { dataComplete: boolean; known: boolean } {
  const { data: status } = useOnboardingStatus();
  const { data: myProfile, isPending: profilePending } = useMyProfile();
  const remembered = wasOnboardingComplete(myProfile?.user_id);

  useEffect(() => {
    if (status?.dataComplete && myProfile?.user_id) rememberOnboardingComplete(myProfile.user_id);
  }, [status?.dataComplete, myProfile?.user_id]);

  if (status) return { dataComplete: status.dataComplete, known: true };
  if (remembered) return { dataComplete: true, known: true };
  if (myProfile?.onboarding_completed_at) return { dataComplete: true, known: true };
  // No status row read yet: the answer is genuinely unknown until the profile
  // read lands. Callers must not render the incomplete UI on this.
  return { dataComplete: false, known: !profilePending && myProfile !== undefined };
}

export function useMemberAppUnlocked(): {
  unlocked: boolean;
  resumePath: string;
  known: boolean;
} {
  const { isAdmin, isProfessional, isBrand, loading: rolesLoading } = useRoles();
  const { hasAccess, isLoading: subLoading } = useConsumerSubscription();
  const { data: status } = useOnboardingStatus();
  const { data: myProfile, isPending: profilePending } = useMyProfile();

  // Once the health profile is in, send her to the pick-up-where-you-left-off
  // prompt rather than straight into a form, so hair characteristics, the
  // consultation and blood work are all offered.
  const resumePath = status?.entryPath ?? "/onboarding/profile-step-1";

  const completedStamp = !!myProfile?.onboarding_completed_at;
  const remembered = wasOnboardingComplete(myProfile?.user_id);

  // Remember a positive answer for the session, so a cache eviction or a slow
  // read on a later navigation can never put a finished member back into the
  // "unknown" state — that reversion is what flashed the onboarding bar.
  useEffect(() => {
    if ((status?.dataComplete || completedStamp) && myProfile?.user_id) {
      rememberOnboardingComplete(myProfile.user_id);
    }
  }, [status?.dataComplete, completedStamp, myProfile?.user_id]);

  // Staff / non-consumer accounts keep their navigation.
  if (isAdmin || isProfessional || isBrand) return { unlocked: true, resumePath, known: true };

  // While the status read is in flight, fall back to the profile's completion
  // stamp rather than assuming "unlocked" — an unfinished member must never see
  // the nav flash into view.
  const dataComplete = status ? status.dataComplete : completedStamp || remembered;

  // Never blink the navigation away from an established member while the
  // membership read is still in flight: if they have already finished
  // onboarding, keep the chrome until we actually know access has lapsed (the
  // route gates handle a lapsed member anyway).
  if (subLoading && (completedStamp || remembered)) {
    return { unlocked: true, resumePath, known: true };
  }

  const unlocked = dataComplete && hasAccess;
  // Unknown until BOTH inputs have answered: the onboarding status (or the
  // durable completion stamp) and the entitlement read.
  const progressKnown = status !== undefined || remembered || (!profilePending && myProfile !== undefined);
  const known = unlocked || (progressKnown && !subLoading && !rolesLoading);

  return { unlocked, resumePath, known };
}

