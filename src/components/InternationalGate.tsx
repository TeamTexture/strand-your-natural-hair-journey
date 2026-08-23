import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useInternationalBlock } from "@/hooks/useInternationalBlock";
import LoadingDot from "@/components/LoadingDot";
import InternationalBlockedSplash from "@/components/InternationalBlockedSplash";

/**
 * UK-only gate for registered accounts. Sits above the routed tree, so a
 * flagged account sees the splash instead of onboarding or the app, on this
 * login and every future one.
 *
 * The check is a STORED flag, set once right after registration — existing UK
 * members are never re-geo-checked, so travelling abroad changes nothing.
 */
const ALLOWED_PREFIXES = [
  "/legal",
  "/auth",
  "/pro/auth",
  "/brand/auth",
  "/reset-password",
  "/forgot-password",
  "/.lovable/oauth/consent",
];

const InternationalGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const { blocked, country, isLoading } = useInternationalBlock();

  if (!user || loading) return <>{children}</>;
  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }
  if (isLoading) return <LoadingDot />;
  if (blocked) return <InternationalBlockedSplash country={country} />;
  return <>{children}</>;
};

export default InternationalGate;
