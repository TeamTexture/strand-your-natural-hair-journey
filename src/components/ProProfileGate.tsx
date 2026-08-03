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
 *   draft | changes_requested → /pro/setup (completeness only)
 *   everything else           → through to the portal
 *
 * POLICY (Paige): approval happens once, at application stage. Profile edits
 * publish to the directory instantly — there is no re-approval holding screen.
 *
 * Admins bypass entirely, and already-published pros were backfilled to
 * 'approved' so nothing changes for them.
 */
const ProProfileGate = ({ children }: Props) => {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const { profile, needsSetup, isLoading } = useMyProProfile();
  const loc = useLocation();

  if (isAdmin) return <>{children}</>;
  if (rolesLoading || isLoading) return <LoadingDot />;

  // No profile row at all — nothing to gate on; the destination screen
  // explains how to get help.
  if (!profile) return <>{children}</>;

  if (needsSetup && loc.pathname !== "/pro/setup") {
    return <Navigate to="/pro/setup" replace />;
  }
  return <>{children}</>;
};

export default ProProfileGate;
