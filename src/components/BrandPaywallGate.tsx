import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { useBrandLockout } from "@/hooks/useBrandLockout";
import { BRAND_PAYWALL_PATH, isBrandPaywallAllowedPath } from "@/lib/brandPaywall";

/**
 * Global brand paywall.
 *
 * Sits above the routed tree: an unpaid brand account can render NOTHING
 * except the paywall, the payment path, the legal documents and support
 * contact. Typing an internal URL, using the hamburger, or navigating back
 * into the app all land on the paywall.
 */
const BrandPaywallGate = ({ children }: { children: ReactNode }) => {
  const { locked, isBrandOnly, loading } = useBrandLockout();
  const { pathname } = useLocation();

  // Never flash app content while the subscription record is being read.
  if (isBrandOnly && loading && !isBrandPaywallAllowedPath(pathname)) {
    return <LoadingDot />;
  }
  if (locked && !isBrandPaywallAllowedPath(pathname)) {
    return <Navigate to={BRAND_PAYWALL_PATH} replace />;
  }
  return <>{children}</>;
};

export default BrandPaywallGate;
