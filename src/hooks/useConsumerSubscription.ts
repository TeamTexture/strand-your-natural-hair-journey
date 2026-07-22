import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

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

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Membership access hook.
 *
 * A user has access when ANY of the following is true:
 *   - complimentary_access = true on their profile (founding members, testers, stakeholders)
 *   - role is admin or professional (they're never paywalled on the consumer side)
 *   - Stripe subscription is active/trialing and not lapsed
 */
export function useConsumerSubscription() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isProfessional, isBrand, loading: rolesLoading } = useRoles();

  const subQ = useQuery({
    queryKey: ["consumer_subscription", user?.id],
    enabled: !!user?.id,
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

  const compQ = useQuery({
    queryKey: ["consumer_complimentary", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("complimentary_access")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!(data as { complimentary_access?: boolean } | null)?.complimentary_access;
    },
  });

  const sub = subQ.data ?? null;
  const stripeActive =
    !!sub &&
    ACTIVE_STATUSES.has(sub.status) &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

  const complimentary = !!compQ.data;
  const isAdminOrPro = isAdmin || isProfessional;
  const hasAccess = stripeActive || complimentary || isAdminOrPro;

  return {
    subscription: sub,
    stripeActive,
    complimentary,
    isAdminOrPro,
    isBrand,
    hasAccess,
    isLoading: authLoading || rolesLoading || subQ.isLoading || compQ.isLoading,
    refetch: () => {
      subQ.refetch();
      compQ.refetch();
    },
  };
}
