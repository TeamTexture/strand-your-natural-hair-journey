import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
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
  const { hasAccess, isBrand, isAdminOrPro, isLoading: subLoading } = useConsumerSubscription();
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
  // Locked to /subscribe once they have reached the payment checkpoint —
  // onboarding finished OR blood data on file — and have no entitlement.
  if (status?.paymentDue && !hasAccess) {
    return <Navigate to={getSubscribePath(status.analysisPath)} replace />;
  }
  return <>{children}</>;
};

export default OnboardingGate;
