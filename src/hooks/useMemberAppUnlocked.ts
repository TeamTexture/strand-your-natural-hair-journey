import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useRoles } from "@/hooks/useRoles";

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
export function useMemberAppUnlocked(): { unlocked: boolean; resumePath: string } {
  const { isAdmin, isProfessional, isBrand } = useRoles();
  const { hasAccess, isLoading: subLoading } = useConsumerSubscription();
  const { data: status } = useOnboardingStatus();
  const { data: myProfile } = useMyProfile();

  // Once the health profile is in, send her to the pick-up-where-you-left-off
  // prompt rather than straight into a form, so hair and blood are both offered.
  const resumePath =
    status && status.healthComplete && !status.dataComplete
      ? "/onboarding/resume"
      : (status?.resumePath ?? "/onboarding/profile-step-1");

  // Staff / non-consumer accounts keep their navigation.
  if (isAdmin || isProfessional || isBrand) return { unlocked: true, resumePath };

  // While the status read is in flight, fall back to the profile's completion
  // stamp rather than assuming "unlocked" — an unfinished member must never see
  // the nav flash into view.
  const dataComplete = status ? status.dataComplete : !!myProfile?.onboarding_completed_at;

  // Never blink the navigation away from an established member while the
  // membership read is still in flight: if they have already finished
  // onboarding, keep the chrome until we actually know access has lapsed (the
  // route gates handle a lapsed member anyway).
  if (subLoading && !!myProfile?.onboarding_completed_at) return { unlocked: true, resumePath };

  return { unlocked: dataComplete && hasAccess, resumePath };
}
