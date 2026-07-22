import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * STRAND+ access.
 *
 * Anyone whose Stripe subscription tier = 'plus' AND is active,
 * OR who has complimentary_access, OR who is an admin.
 */
export function usePlusAccess() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["plus_access", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("has_active_plus_subscription", {
        _user: user!.id,
      });
      if (error) throw error;
      return !!data;
    },
  });
  return {
    hasPlus: !!q.data,
    isLoading: loading || q.isLoading,
    refetch: q.refetch,
  };
}
