import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

export type BrandSubscription = {
  brand_user_id: string;
  status: string;
  current_period_end: string | null;
  price_id: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function useBrandSubscription() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const q = useQuery({
    queryKey: ["brand_subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<BrandSubscription | null> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: BrandSubscription | null; error: unknown }>;
            };
          };
        };
      })
        .from("brand_subscriptions")
        .select("*")
        .eq("brand_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const sub = q.data ?? null;
  const subActive =
    !!sub &&
    ACTIVE_STATUSES.has(sub.status) &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  // Admins bypass, mirroring pro/consumer helpers.
  const isActive = isAdmin || subActive;

  return {
    subscription: sub,
    isActive,
    subActive,
    isAdminOverride: isAdmin && !subActive,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
