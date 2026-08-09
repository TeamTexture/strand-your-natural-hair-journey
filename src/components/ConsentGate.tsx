import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useConsentState } from "@/hooks/useConsentState";
import LoadingDot from "@/components/LoadingDot";
import ConsentGateScreen from "@/pages/ConsentGateScreen";

/**
 * Mandatory consent gate. Sits above the whole routed tree, so it applies to
 * every view (My STRAND, professional, brand, admin) and cannot be bypassed by
 * navigating directly to a route — the gate screen replaces the route's element
 * rather than redirecting.
 *
 * Requirements are scoped to the ACTIVE VIEW (useConsentState → useActiveRoleView),
 * never the union of the account's roles, so a four-role account inside My STRAND
 * is asked for member items only.
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
  const { needsConsent, outstanding, optionalOutstanding, optionalKeys, latest, view, isLoading } =
    useConsentState();

  if (!user || loading) return <>{children}</>;
  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }
  if (isLoading) return <LoadingDot />;
  if (needsConsent)
    return (
      <ConsentGateScreen
        outstanding={outstanding}
        // Only optional items never answered before — nothing already decided is
        // re-asked, in any view.
        optionalKeys={optionalOutstanding}
        view={view}
        optionalGranted={Object.fromEntries(
          optionalKeys.map((k) => [k, !!latest[k]?.granted]),
        )}
      />
    );
  return <>{children}</>;
};

export default ConsentGate;
