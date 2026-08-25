import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import MembershipEnded from "@/components/MembershipEnded";
import MembershipPaused from "@/components/MembershipPaused";
import DeletionPending from "@/components/DeletionPending";
import ProgressCheckFailed from "@/components/ProgressCheckFailed";

import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useRoles } from "@/hooks/useRoles";
import { BRAND_ACCESS_PATH } from "@/lib/consumerOnboarding";

interface Props {
  children: ReactNode;
}

/**
 * Consumer paywall gate.
 *
 * Wraps the main app routes (home, wash days, journal, shelf, nutrition,
 * appointments) — anyone without an active membership, complimentary access,
 * or an admin/pro role is redirected to /subscribe. Auth is still required.
 *
 * Use for routes that are members-only. Profile, billing, and the directory
 * remain accessible without a subscription — they use <Protected> directly.
 */
const PaidGate = ({ children }: Props) => (
  <RequireAuth>
    <PaidGateInner>{children}</PaidGateInner>
  </RequireAuth>
);

const PaidGateInner = ({ children }: { children: ReactNode }) => {
  const {
    hasAccess,
    isLoading,
    isBrand,
    isAdminOrPro,
    lapsed,
    paused,
    deletionRequestedAt,
    refetch,
  } = useConsumerSubscription();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const location = useLocation();
  // Shares the route gate's cached read, so moving between paid screens no
  // longer refires a six-request profile check or flashes a full-page loader.
  const { data: onboarding, isLoading: onboardingLoading, isError: onboardingError } = useOnboardingStatus();

  // Revalidate entitlement on every route change into a paid area, so a
  // cancellation mid-session is caught without a hard reload.
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!onboarding && (isLoading || rolesLoading || onboardingLoading)) return <LoadingDot />;


  // A member's own erasure request closes the app for them, with an explanation
  // and a one-tap route back. Checked before roles so it is never invisible.
  if (deletionRequestedAt) return <DeletionPending />;
  // Stripe leaves a paused subscription as `active` — the pause flag decides.
  if (paused) return <MembershipPaused />;

  // Professionals live entirely on the pro side — no consumer app access.
  if (isProfessional && !isAdmin) return <Navigate to="/pro" replace />;
  if (isBrand && !isAdminOrPro) {
    return <Navigate to={`${BRAND_ACCESS_PATH}?next=${encodeURIComponent("/brand")}`} replace />;
  }

  // A failed progress read is NOT an unfinished profile. Sending members back
  // to step one on a dropped request is what made a finished profile look like
  // it had been wiped, so hold the screen and let them retry instead.
  if (!isAdminOrPro && !onboarding) {
    if (onboardingError) return <ProgressCheckFailed />;
    return <LoadingDot />;
  }

  if (!isAdminOrPro && !onboarding.dataComplete) {
    return <Navigate to={onboarding.resumePath ?? "/onboarding/profile-step-1"} replace />;
  }


  // ENTITLEMENT MUST BE KNOWN BEFORE ANY PAYWALL UI. A paying member must never
  // see the paywall or the membership-ended screen because a read was still in
  // flight: unresolved renders the neutral loader, never the negative state.
  if (!hasAccess && isLoading) return <LoadingDot />;

  if (!hasAccess) {
    // A member whose membership has ended gets an explanation, never a silent
    // bounce. Someone who has never subscribed goes to the paywall as before.
    if (lapsed) return <MembershipEnded next={location.pathname + location.search} />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/subscribe?next=${next}`} replace />;
  }
  return <>{children}</>;
};



export default PaidGate;
