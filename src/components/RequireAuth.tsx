import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocalStorageMigration } from "@/hooks/useLocalStorageMigration";
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
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?next=${next}`} replace />;
  }
  return <>{children}</>;
};

export default RequireAuth;
