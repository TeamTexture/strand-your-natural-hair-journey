import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import {
  ConsentKey,
  ConsentRole,
  ConsentRow,
  ConsentView,
  fetchConsentRows,
  latestByKey,
  mandatoryKeysForView,
  optionalKeysForView,
  outstandingMandatory,
  resolveConsentView,
  unansweredOptional,
} from "@/lib/consent";

export const consentKey = (userId?: string) => ["user-consents", userId] as const;

/**
 * Current consent state for the signed-in user, derived from the append-only
 * user_consents table. Nothing is ever assumed granted — a member with no rows
 * is outstanding on every mandatory key for the view they are in.
 *
 * SCOPING: requirements follow the ACTIVE VIEW (My STRAND / professional /
 * brand / admin), never the union of the account's roles. That is what keeps
 * the professional undertaking out of the end user side and the medical
 * disclaimer out of the brand side for a multi-role account.
 */
export function useConsentState() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const activeView = useActiveRoleView();
  const q = useQuery({
    queryKey: consentKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchConsentRows(user!.id),
  });

  const rows: ConsentRow[] = q.data ?? [];
  const consentRoles = roles as ConsentRole[];
  // Clamp the remembered/route view to a view this account may actually enter.
  const view: ConsentView = resolveConsentView(activeView as ConsentView, consentRoles);
  const latest = latestByKey(rows);
  const outstanding = rolesLoading ? [] : outstandingMandatory(rows, view);
  // Only optional items that have NEVER been answered are still outstanding.
  const optionalOutstanding = rolesLoading ? [] : unansweredOptional(rows, view);

  const isGranted = (key: ConsentKey) => !!latest[key]?.granted;

  return {
    rows,
    latest,
    outstanding,
    isGranted,
    roles: consentRoles,
    /** The view these requirements were resolved for. */
    view,
    mandatoryKeys: mandatoryKeysForView(view),
    /** Every optional key offered in this view (answered or not). */
    optionalKeys: optionalKeysForView(view),
    /** Optional keys still genuinely unanswered — the only ones safe to ask for. */
    optionalOutstanding,
    needsConsent:
      !!user && !q.isLoading && !rolesLoading && !q.isError && outstanding.length > 0,
    isLoading: q.isLoading || rolesLoading,
    refetch: q.refetch,
  };
}
