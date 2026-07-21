import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";
import LoadingDot from "./LoadingDot";

interface Props {
  children: ReactNode;
}

/**
 * Gates the pro dashboard behind an active Stripe subscription. Admins
 * bypass entirely. Approved pros without an active subscription are
 * redirected to /pro/welcome for the acceptance + first-payment screen.
 */
const ProSubGate = ({ children }: Props) => {
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const { isActive, isLoading: subLoading } = useProSubscription();

  if (rolesLoading || subLoading) return <LoadingDot />;
  // Admins can view pro screens regardless of subscription state.
  if (isAdmin) return <>{children}</>;
  if (isProfessional && !isActive) {
    return <Navigate to="/pro/welcome" replace />;
  }
  return <>{children}</>;
};

export default ProSubGate;
