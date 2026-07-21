import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import { useRoles, type AppRole } from "@/hooks/useRoles";

interface Props {
  allow: AppRole[];
  children: ReactNode;
  /** Where to send users who lack the required role. Default: /home. */
  fallback?: string;
}

/** Requires (a) authentication and (b) at least one of the listed roles.
 *  Consumer routes should keep using <RequireAuth> directly — this is for
 *  /pro/* and /admin/*. */
const RoleGate = ({ allow, children, fallback = "/home" }: Props) => (
  <RequireAuth>
    <RoleGateInner allow={allow} fallback={fallback}>
      {children}
    </RoleGateInner>
  </RequireAuth>
);

const RoleGateInner = ({
  allow,
  fallback,
  children,
}: {
  allow: AppRole[];
  fallback: string;
  children: ReactNode;
}) => {
  const { roles, loading } = useRoles();
  if (loading) return <LoadingDot />;
  const permitted = roles.some((r) => allow.includes(r));
  if (!permitted) return <Navigate to={fallback} replace />;
  return <>{children}</>;
};

export default RoleGate;
