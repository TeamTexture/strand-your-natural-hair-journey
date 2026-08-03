import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useComplimentaryAccess } from "@/hooks/useComplimentaryAccess";

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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<boolean> => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc("has_active_plus_subscription", {
        _user: user.id,
      });
      if (error) throw error;
      return !!data;
    },
  });
  const { complimentary, isLoading: compLoading } = useComplimentaryAccess();
  return {
    // Complimentary accounts hold every tier, including STRAND+.
    hasPlus: !!q.data || complimentary,
    isLoading: loading || q.isLoading || compLoading,
    refetch: q.refetch,
  };
}
