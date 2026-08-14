import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocalStorageMigration } from "@/hooks/useLocalStorageMigration";
import { recoveryLockPath } from "@/lib/recoveryLock";
import LoadingDot from "./LoadingDot";

interface Props {
  children: ReactNode;
}

/** Gate routes that need a signed-in user. Also fires the one-time
 *  localStorage → Postgres migration on the first authed render of any
 *  protected route (idempotent — see useLocalStorageMigration). */
const RequireAuth = ({ children }: Props) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  useLocalStorageMigration();
  if (loading) return <LoadingDot />;
  if (!user) {
    // Do not purge here. A slow refresh can briefly resolve without a user
    // before auth restoration finishes; deleting strand_* at that moment
    // destroys the member's unsaved onboarding draft. Confirmed sign-out is
    // already purged centrally by AuthProvider.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?next=${next}`} replace />;
  }
  // A password-recovery session is NOT proof of a password. Until the new
  // password is saved, every protected route bounces back to the reset form.
  const lockPath = recoveryLockPath();
  if (lockPath && location.pathname !== lockPath) {
    return <Navigate to={lockPath} replace />;
  }
  return <>{children}</>;
};

export default RequireAuth;
