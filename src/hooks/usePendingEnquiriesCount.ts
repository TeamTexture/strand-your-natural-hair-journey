import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Pending enquiry count for the currently-signed-in professional. Powers the
 * "Enquiries" card badge on the pro dashboard.
 */
export function usePendingEnquiriesCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro_inbox_pending_count", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("pro_enquiries")
        .select("id", { head: true, count: "exact" })
        .eq("pro_user_id", user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
