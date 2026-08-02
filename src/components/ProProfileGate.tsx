import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRoles } from "@/hooks/useRoles";
import { useMyProProfile } from "@/hooks/useProProfileReview";
import LoadingDot from "./LoadingDot";

interface Props {
  children: ReactNode;
}

/**
 * Mandatory professional profile setup gate.
 *
 * Sits inside ProSubGate: a professional with an active (or complimentary)
 * subscription still cannot reach the portal until their profile has been
 * completed and approved by the Strand Council.
 *
 *   draft | changes_requested → /pro/setup
 *   submitted                 → /pro/under-review
 *   approved                  → through to the portal
 *
 * Admins bypass entirely, and already-published pros were backfilled to
 * 'approved' so nothing changes for them.
 */
const ProProfileGate = ({ children }: Props) => {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const { profile, needsSetup, underReview, isLoading } = useMyProProfile();
  const loc = useLocation();

  if (isAdmin) return <>{children}</>;
  if (rolesLoading || isLoading) return <LoadingDot />;

  // No profile row at all — nothing to gate on; the destination screen
  // explains how to get help.
  if (!profile) return <>{children}</>;

  if (needsSetup && loc.pathname !== "/pro/setup") {
    return <Navigate to="/pro/setup" replace />;
  }
  if (underReview && loc.pathname !== "/pro/under-review") {
    return <Navigate to="/pro/under-review" replace />;
  }

  return <>{children}</>;
};

export default ProProfileGate;
