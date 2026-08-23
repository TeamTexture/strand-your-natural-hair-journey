import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import ProgressCheckFailed from "@/components/ProgressCheckFailed";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useRoles } from "@/hooks/useRoles";
import { BRAND_ACCESS_PATH } from "@/lib/consumerOnboarding";
import { getOnboardingNextPath } from "@/lib/onboardingDecision";
import { clearResumeLock } from "@/lib/onboardingLock";

interface Props {
  children: ReactNode;
}

/**
 * Post-onboarding lock.
 *
 * If the user has already finished onboarding (profiles.onboarding_completed_at
 * is set) but has no active membership / complimentary access / privileged role,
 * they are locked to /subscribe and cannot revisit onboarding, setup, or the
 * walkthrough. This prevents free navigation back through the flow after they
 * upload everything but skip payment.
 *
 * Users mid-onboarding (no onboarding_completed_at yet) pass through so they
 * can finish the flow — the paywall then catches them on the way into /home.
 */
const OnboardingGate = ({ children }: Props) => (
  <RequireAuth>
    <OnboardingGateInner>{children}</OnboardingGateInner>
  </RequireAuth>
);

const OnboardingGateInner = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { hasAccess, paymentRequired, isBrand, isAdminOrPro, isLoading: subLoading } = useConsumerSubscription();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();

  const { data: status, isLoading: profileLoading, isError: profileError, refetch } = useOnboardingStatus();

  useEffect(() => {
    if (status?.dataComplete) clearResumeLock();
  }, [status?.dataComplete]);

  // Do not replace a usable onboarding screen with a full-page loader during
  // background revalidation. That flash was experienced as a blank/glitching
  // page on slower mobile connections.
  if (!status && (subLoading || profileLoading || rolesLoading)) return <LoadingDot />;

  // Never interpret an unavailable status response as an empty profile. Keep
  // every saved stage intact and let the member retry the read in place.
  if (!status) {
    if (profileError) return <ProgressCheckFailed onRetry={() => void refetch()} />;
    return <LoadingDot />;
  }

  // Professionals live entirely on the pro side — no consumer onboarding.
  if (isProfessional && !isAdmin) return <Navigate to="/pro" replace />;
  if (isBrand && !isAdminOrPro) {
    return <Navigate to={`${BRAND_ACCESS_PATH}?next=${encodeURIComponent("/brand")}`} replace />;
  }
  if (!status?.dataComplete) {
    const allowed = new Set(["/onboarding/profile-step-1"]);
    if (status?.basicComplete) allowed.add("/onboarding/profile-step-2");
    // The pick-up-where-you-left-off prompt is reachable from the moment the
    // hair/blood section opens, so a returning member can always get back in.
    if (status?.healthComplete) {
      allowed.add("/onboarding/resume");
      // Supplements sit between the health profile and the pro gate. Leaving
      // this path out of the allow-list bounced every new member straight past
      // the step, so supplements were never captured during onboarding.
      allowed.add("/onboarding/profile-supplements");
      allowed.add("/onboarding/pro-gate");
      allowed.add("/onboarding/pro-book");
      allowed.add("/onboarding/pro-details");
      allowed.add("/onboarding/profile-step-3-hair");
    }
    if (status?.hairComplete) allowed.add("/onboarding/profile-step-4-colour");
    // Blood work is NOT sequenced behind hair characteristics. Members routinely
    // have their results before their consultation, and gating the blood screens
    // on styleComplete froze the "Add my blood results" button on the resume
    // screen — every tap bounced straight back here. Both requirements are
    // independent; neither one alone unlocks the app.
    if (status?.healthComplete) {
      allowed.add("/onboarding/blood-timing");
      allowed.add("/blood-upload");
      allowed.add("/onboarding/blood-iron-vitamins");
      allowed.add("/onboarding/blood-minerals");
      allowed.add("/onboarding/blood-thyroid");
      allowed.add("/onboarding/blood-hormones");
      allowed.add("/onboarding/blood-ai-summary");
    }


    // The consultation is optional and ongoing: the resume screen routes the hair
    // journey through pro-details first, but an unlogged consultation must never
    // block the markers form — that would stop her ever reaching Subscribe.

    if (!allowed.has(location.pathname)) {
      return <Navigate to={getOnboardingNextPath(status, hasAccess)} replace />;
    }
  }
  // The blood-work screens are one multi-step form. Saving the first panel makes
  // the profile "complete", so paywalling immediately threw members out halfway
  // through and lost the markers they had not saved yet. Let them finish the
  // blood flow first; the paywall then catches them on the way to Home.
  const bloodFlowPaths = new Set([
    "/onboarding/blood-timing",
    "/blood-upload",
    "/onboarding/blood-iron-vitamins",
    "/onboarding/blood-minerals",
    "/onboarding/blood-thyroid",
    "/onboarding/blood-hormones",
  ]);
  const inBloodFlow = bloodFlowPaths.has(location.pathname);

  // A forced-payment flag must never interrupt data capture. It becomes a hard
  // paywall only after the full profile and blood-work flow is complete.
  if (status?.dataComplete && (paymentRequired || status.paymentDue) && !hasAccess && !inBloodFlow) {
    return <Navigate to={getOnboardingNextPath(status, hasAccess)} replace />;
  }


  // Old bookmarks and emailed links can point back into capture screens after
  // onboarding is complete. Never reopen those stale forms or expose the menu
  // around them; paid members return to Home instead.
  const capturePaths = new Set([
    "/onboarding/profile-step-1",
    "/onboarding/profile-step-2",
    "/onboarding/profile-supplements",
    "/onboarding/pro-gate",
    "/onboarding/pro-book",
    "/onboarding/pro-details",
    "/onboarding/profile-step-3-hair",
    "/onboarding/profile-step-4-colour",
    "/onboarding/resume",
    "/onboarding/blood-timing",
    "/blood-upload",
    "/onboarding/blood-iron-vitamins",
    "/onboarding/blood-minerals",
    "/onboarding/blood-thyroid",
    "/onboarding/blood-hormones",
  ]);
  if (status?.dataComplete && hasAccess && capturePaths.has(location.pathname)) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default OnboardingGate;
