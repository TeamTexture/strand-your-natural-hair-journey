import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useRoles";

/** Live-ish count of pending pro applications. Admin-only. */
export function usePendingApplicationsCount() {
  const { isAdmin } = useRoles();
  return useQuery({
    queryKey: ["admin", "pending-applications-count"],
    enabled: isAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pro_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
