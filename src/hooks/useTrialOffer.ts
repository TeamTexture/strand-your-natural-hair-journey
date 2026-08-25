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
    placeholderData: (prev) => prev,
  });

  return {
    walled: !!q.data?.walled,
    trialEligible: !!q.data?.trialEligible,
    /** False until the answer is known — never wall or unwall on a guess. */
    known: !!user?.id && !!q.data,
    loading: authLoading || q.isLoading,
    refetch: q.refetch,
  };
}
