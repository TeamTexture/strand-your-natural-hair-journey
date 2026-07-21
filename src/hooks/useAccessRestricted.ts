import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns whether the currently signed-in user has been access-restricted by
 * an admin. When true, every route in the app is replaced with the block
 * screen (see AccessRestrictedGate).
 */
export function useAccessRestricted() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["access_restricted", user?.id],
    enabled: !!user?.id,
    // Poll periodically so lifting the restriction eventually reaches the client
    // without requiring a hard refresh.
    refetchInterval: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("access_restricted")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!(data as { access_restricted?: boolean } | null)?.access_restricted;
    },
  });
  return {
    isRestricted: !!q.data,
    isLoading: q.isLoading,
  };
}
