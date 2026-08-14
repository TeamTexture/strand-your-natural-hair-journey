import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getConsumerOnboardingStatus } from "@/lib/consumerOnboarding";

/**
 * ONE source of onboarding progress for every gate.
 *
 * The route gate and the paywall gate each used to run their own copy of this
 * six-request read under a different query key. Each navigation therefore fired
 * twelve reads and, because neither result was cached, both gates rendered a
 * full-page loader on every screen change — experienced by members as the app
 * "glitching" or flashing blank between steps.
 *
 * Now: one shared key (the one the onboarding steps already invalidate), a
 * short freshness window, retries on transient failures, and the previous
 * answer kept while revalidating so a usable screen is never replaced by a
 * spinner.
 */
export const onboardingStatusKey = (userId?: string) => ["consumer_onboarding_route", userId];

export function useOnboardingStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: onboardingStatusKey(user?.id),
    enabled: !!user?.id,
    queryFn: () => {
      if (!user?.id) throw new Error("A signed-in member is required for onboarding");
      return getConsumerOnboardingStatus(user.id);
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/** Call after any save that can advance onboarding, so gates see it at once. */
export function useInvalidateOnboardingStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return () => qc.invalidateQueries({ queryKey: onboardingStatusKey(user?.id) });
}
