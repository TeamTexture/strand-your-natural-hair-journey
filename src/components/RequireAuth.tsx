import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "./LoadingDot";

interface Props {
  children: ReactNode;
}

/** Gate routes that need a signed-in user. */
const RequireAuth = ({ children }: Props) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingDot />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  return <>{children}</>;
};

export default RequireAuth;
