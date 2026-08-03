import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useMyProProfile } from "@/hooks/useProProfileReview";
import LoadingDot from "./LoadingDot";

interface Props {
  children: ReactNode;
}

const GRACE_KEY = "strand_pro_checkout_grace";
const GRACE_MS = 10 * 60 * 1000;

/** True for a short window after a professional returns from Stripe, so the
 * dashboard is never bounced back to the subscribe screen while the webhook
 * is still landing. */
export function isProCheckoutGrace() {
  try {
    if (window.location.search.includes("checkout=success")) return true;
    const ts = parseInt(sessionStorage.getItem(GRACE_KEY) ?? "", 10);
    return Number.isFinite(ts) && Date.now() - ts < GRACE_MS;
  } catch {
    return false;
  }
}

export function startProCheckoutGrace() {
  try {
    sessionStorage.setItem(GRACE_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Gates the pro dashboard behind an active Stripe subscription. Admins
 * bypass entirely. Approved pros without an active subscription are
 * redirected to /pro/welcome for the acceptance + first-payment screen.
 */
const ProSubGate = ({ children }: Props) => {
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const { isActive, isLoading: subLoading, refetch } = useProSubscription();
  // Pros who have completed their profile have already passed the acceptance
  // moment — never bounce them back to it.
  const { setupComplete, isLoading: profLoading } = useMyProProfile();
  const grace = isProCheckoutGrace();

  // While in the post-payment grace window, keep polling until the
  // subscription row appears.
  useEffect(() => {
    if (!grace || isActive) return;
    const t = setInterval(() => refetch(), 3000);
    return () => clearInterval(t);
  }, [grace, isActive, refetch]);

  if (rolesLoading || subLoading || profLoading) return <LoadingDot />;
  // Admins can view pro screens regardless of subscription state.
  if (isAdmin) return <>{children}</>;
  if (isProfessional && !isActive && !grace && !setupComplete) {
    return <Navigate to="/pro/welcome" replace />;
  }
  return <>{children}</>;
};

export default ProSubGate;
