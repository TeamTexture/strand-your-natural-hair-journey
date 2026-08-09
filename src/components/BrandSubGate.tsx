import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import RoleGate from "@/components/RoleGate";
import LoadingDot from "@/components/LoadingDot";
import { useBrandLockout } from "@/hooks/useBrandLockout";
import { BRAND_PAYWALL_PATH } from "@/lib/brandPaywall";

/**
 * Brand route guard: authentication + brand (or admin) role + an active,
 * webhook-confirmed brand subscription (or admin-set complimentary access).
 * Defence in depth alongside <BrandPaywallGate> and the RLS policies.
 */
const BrandSubGate = ({ children }: { children: ReactNode }) => (
  <RoleGate allow={["brand", "admin"]}>
    <Inner>{children}</Inner>
  </RoleGate>
);

const Inner = ({ children }: { children: ReactNode }) => {
  const { locked, isBrandOnly, loading } = useBrandLockout();
  if (isBrandOnly && loading) return <LoadingDot />;
  if (locked) return <Navigate to={BRAND_PAYWALL_PATH} replace />;
  return <>{children}</>;
};

export default BrandSubGate;
