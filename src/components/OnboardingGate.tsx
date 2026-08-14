import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useRoles } from "@/hooks/useRoles";
import { BRAND_ACCESS_PATH, getConsumerOnboardingStatus, getSubscribePath } from "@/lib/consumerOnboarding";

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
  const { user } = useAuth();
  const location = useLocation();
  const { hasAccess, paymentRequired, isBrand, isAdminOrPro, isLoading: subLoading } = useConsumerSubscription();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();

  const { data: status, isLoading: profileLoading } = useQuery({
    queryKey: ["profile_onboarding_completed", user?.id],
    enabled: !!user?.id,
    queryFn: () => getConsumerOnboardingStatus(user!.id),
  });

  if (subLoading || profileLoading || rolesLoading) return <LoadingDot />;
  // Professionals live entirely on the pro side — no consumer onboarding.
  if (isProfessional && !isAdmin) return <Navigate to="/pro" replace />;
  if (isBrand && !isAdminOrPro) {
    return <Navigate to={`${BRAND_ACCESS_PATH}?next=${encodeURIComponent("/brand")}`} replace />;
  }
  if (!status?.dataComplete) {
    const allowed = new Set(["/onboarding/profile-step-1"]);
    if (status?.basicComplete) allowed.add("/onboarding/profile-step-2");
    if (status?.healthComplete) {
      allowed.add("/onboarding/pro-gate");
      allowed.add("/onboarding/pro-book");
      allowed.add("/onboarding/pro-details");
      allowed.add("/onboarding/profile-step-3-hair");
    }
    if (status?.hairComplete) allowed.add("/onboarding/profile-step-4-colour");
    if (status?.styleComplete) {
      allowed.add("/onboarding/blood-timing");
      allowed.add("/blood-upload");
    }
    if (!allowed.has(location.pathname)) {
      return <Navigate to={status?.resumePath ?? "/onboarding/profile-step-1"} replace />;
    }
  }
  // Locked to /subscribe once onboarding data capture is finished (or an admin
  // has forced payment) and there is no entitlement. Members still mid-capture
  // pass through so they can finish their profile before being asked to pay.
  if ((paymentRequired || status?.paymentDue) && !hasAccess) {
    return <Navigate to={getSubscribePath(status?.analysisPath)} replace />;
  }

  return <>{children}</>;
};

export default OnboardingGate;
