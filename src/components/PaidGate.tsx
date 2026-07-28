import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
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
  const { hasAccess, isLoading, isBrand, isAdminOrPro } = useConsumerSubscription();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const location = useLocation();
  if (isLoading || rolesLoading) return <LoadingDot />;
  // Professionals live entirely on the pro side — no consumer app access.
  if (isProfessional && !isAdmin) return <Navigate to="/pro" replace />;
  if (isBrand && !isAdminOrPro) {
    return <Navigate to={`${BRAND_ACCESS_PATH}?next=${encodeURIComponent("/brand")}`} replace />;
  }

  if (!hasAccess) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/subscribe?next=${next}`} replace />;
  }
  return <>{children}</>;
};

export default PaidGate;
