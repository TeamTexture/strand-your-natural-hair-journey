import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useConsentState } from "@/hooks/useConsentState";
import LoadingDot from "@/components/LoadingDot";
import ConsentGateScreen from "@/pages/ConsentGateScreen";

/**
 * Mandatory consent gate. Sits above the whole routed tree, so it applies to
 * every account type (consumer, professional, brand, admin) and cannot be
 * bypassed by navigating directly to a route — the gate screen replaces the
 * route's element rather than redirecting.
 *
 * Only auth-entry and legal-document routes are allowed through, so a member
 * can read the documents (and sign out / reset a password) before accepting.
 */
const ALLOWED_PREFIXES = [
  "/legal",
  "/auth",
  "/pro/auth",
  "/brand/auth",
  "/reset-password",
  "/forgot-password",
  "/pro/forgot-password",
  "/pro/reset-password",
  "/brand/forgot-password",
  "/brand/reset-password",
  "/.lovable/oauth/consent",
];

const ConsentGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const { needsConsent, outstanding, optionalKeys, isLoading } = useConsentState();

  if (!user || loading) return <>{children}</>;
  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }
  if (isLoading) return <LoadingDot />;
  if (needsConsent)
    return <ConsentGateScreen outstanding={outstanding} optionalKeys={optionalKeys} />;
  return <>{children}</>;
};

export default ConsentGate;
