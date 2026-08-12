import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useMyProfile } from "@/hooks/useMyProfile";
import { subscriptionGrantsAccess } from "@/lib/entitlement";

export type ConsumerSubscription = {
  user_id: string;
  status: string;
  current_period_end: string | null;
  price_id: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier?: "standard" | "plus" | null;
};

/**
 * Membership access hook.
 *
 * A user has access when ANY of the following is true:
 *   - complimentary_access = true on their profile (founding members, testers, stakeholders)
 *   - role is admin or professional (they're never paywalled on the consumer side)
 *   - the Stripe subscription's paid period is still good (see `lib/entitlement`)
 *
 * This query deliberately opts back INTO focus revalidation, against the global
 * QueryClient defaults: a cancellation or a complimentary-access switch-off has
 * to be noticed in-session, not only after a hard reload.
 */
export function useConsumerSubscription() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isProfessional, isBrand, loading: rolesLoading } = useRoles();

  const subQ = useQuery({
    queryKey: ["consumer_subscription", user?.id],
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    queryFn: async (): Promise<ConsumerSubscription | null> => {
      const { data, error } = await supabase
        .from("consumer_subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ConsumerSubscription | null) ?? null;
    },
  });

  const profileQ = useMyProfile();


  const sub = subQ.data ?? null;
  const stripeActive = !!sub &&
    subscriptionGrantsAccess(sub.status, sub.current_period_end);

  const complimentary = !!profileQ.data?.complimentary_access;
  const isAdminOrPro = isAdmin || isProfessional;
  const hasAccess = stripeActive || complimentary || isAdminOrPro;

  /** True when they once had a membership record and it no longer grants access. */
  const lapsed = !hasAccess && !!sub && sub.status !== "none";


  return {
    subscription: sub,
    stripeActive,
    complimentary,
    isAdminOrPro,
    isBrand,
    hasAccess,
    lapsed,

    isLoading: authLoading || rolesLoading || subQ.isLoading || profileQ.isLoading,
    refetch: () => {
      subQ.refetch();
      profileQ.refetch();
    },
  };
}
