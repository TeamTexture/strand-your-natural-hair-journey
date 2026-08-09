import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import {
  ConsentKey,
  ConsentRole,
  ConsentRow,
  fetchConsentRows,
  latestByKey,
  mandatoryKeysForRoles,
  optionalKeysForRoles,
  outstandingMandatory,
} from "@/lib/consent";

export const consentKey = (userId?: string) => ["user-consents", userId] as const;

/**
 * Current consent state for the signed-in user, derived from the append-only
 * user_consents table. Nothing is ever assumed granted — a member with no rows
 * (all 18 pre-existing accounts) is outstanding on every mandatory key.
 */
export function useConsentState() {
  const { user } = useAuth();
  // Requirements are role-aware and resolved as the UNION across the account's
  // roles, so a professional who also uses STRAND as a member still gets the
  // health data consent, and a brand-only account never sees it.
  const { roles, loading: rolesLoading } = useRoles();
  const q = useQuery({
    queryKey: consentKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchConsentRows(user!.id),
  });

  const rows: ConsentRow[] = q.data ?? [];
  const consentRoles = roles as ConsentRole[];
  const latest = latestByKey(rows);
  const outstanding = rolesLoading ? [] : outstandingMandatory(rows, consentRoles);

  const isGranted = (key: ConsentKey) => !!latest[key]?.granted;

  return {
    rows,
    latest,
    outstanding,
    isGranted,
    roles: consentRoles,
    mandatoryKeys: mandatoryKeysForRoles(consentRoles),
    optionalKeys: optionalKeysForRoles(consentRoles),
    needsConsent:
      !!user && !q.isLoading && !rolesLoading && !q.isError && outstanding.length > 0,
    isLoading: q.isLoading || rolesLoading,
    refetch: q.refetch,
  };
}
