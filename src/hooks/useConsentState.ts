import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  ConsentKey,
  ConsentRow,
  fetchConsentRows,
  latestByKey,
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
  const q = useQuery({
    queryKey: consentKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchConsentRows(user!.id),
  });

  const rows: ConsentRow[] = q.data ?? [];
  const latest = latestByKey(rows);
  const outstanding = outstandingMandatory(rows);

  const isGranted = (key: ConsentKey) => !!latest[key]?.granted;

  return {
    rows,
    latest,
    outstanding,
    isGranted,
    needsConsent: !!user && !q.isLoading && !q.isError && outstanding.length > 0,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
