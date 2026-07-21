import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ProSubscription = {
  pro_user_id: string;
  status: string;
  current_period_end: string | null;
  price_id: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function useProSubscription() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["pro_subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ProSubscription | null> => {
      const { data, error } = await supabase
        .from("pro_subscriptions")
        .select("*")
        .eq("pro_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ProSubscription | null) ?? null;
    },
  });

  const sub = q.data ?? null;
  const isActive =
    !!sub &&
    ACTIVE_STATUSES.has(sub.status) &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

  return { subscription: sub, isActive, isLoading: q.isLoading, refetch: q.refetch };
}
