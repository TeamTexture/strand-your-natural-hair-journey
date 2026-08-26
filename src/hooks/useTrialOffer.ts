import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getTrialOfferState, type TrialOfferState } from "@/lib/trialOffer";

export const trialOfferKey = (userId?: string) => ["trial_offer_state", userId];

/**
 * Shared read of the trial paywall decision, so the route guard and the paywall
 * screen agree and only ask once per session window.
 */
export function useTrialOffer() {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: trialOfferKey(user?.id),
    enabled: !!user?.id,
    queryFn: (): Promise<TrialOfferState> => getTrialOfferState(user!.id),
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });
  const hasAuthoritativeData = !!user?.id && !!q.data && !q.isPlaceholderData;

  return {
    walled: hasAuthoritativeData && !!q.data?.walled,
    trialEligible: hasAuthoritativeData && !!q.data?.trialEligible,
    goalCaptured: hasAuthoritativeData && !!q.data?.goalCaptured,
    /** False until the answer is known — never wall or unwall on a guess. */
    known: hasAuthoritativeData,
    loading: authLoading || q.isLoading || q.isPlaceholderData,
    /** True when the query errored after retries. The TrialWall must treat this
     *  as "hold, don't guess" — a failed read must never fail-open into the app. */
    isError: q.isError,
    refetch: q.refetch,
  };
}
