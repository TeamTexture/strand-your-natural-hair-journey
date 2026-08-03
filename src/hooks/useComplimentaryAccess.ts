import { useMyProfile } from "@/hooks/useMyProfile";

/**
 * Lifetime complimentary access.
 *
 * `profiles.complimentary_access = true` is a fully active subscription in
 * every role area — professional, brand, consumer and STRAND+. These accounts
 * must never see payment requests, Stripe checkout, plan-selection screens or
 * expiry warnings.
 *
 * Read live from the profiles row of the EFFECTIVE user, so admin Shadow View
 * reflects the account being viewed (same pattern as useRoles).
 */
export function useComplimentaryAccess() {
  const q = useMyProfile();
  return {
    complimentary: !!q.data?.complimentary_access,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
