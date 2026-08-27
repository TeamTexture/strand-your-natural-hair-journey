import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useRoles";
import { fetchAllRows } from "@/lib/fetchAllRows";

/**
 * Admin-only funnel drop-off counts.
 *
 * incompleteApplications — pro_applications rows with no payment_confirmed_at:
 *   the resumable-draft / never-submitted pile from /pro/auth signups.
 *
 * incompleteMembers      — consumer accounts that have registered but never
 *   crossed the paywall: no active/trialing consumer_subscriptions row,
 *   complimentary_access = false, access_restricted = false.
 *
 *   IMPORTANT: this counts the SAME population as the "Members total" card on
 *   the hub — profiles with international_block = false and no non-consumer
 *   role. It previously counted every profile row (including internationally
 *   blocked registrations and brand logins), which made the "N incomplete"
 *   context line larger than the members total it sits under. Rows are also
 *   read with fetchAllRows rather than a fixed 2000 limit so the number cannot
 *   silently stop growing.
 */
export function useAdminDropOffCounts() {
  const { isAdmin } = useRoles();
  return useQuery({
    queryKey: ["admin", "dropoff-counts"],
    enabled: isAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [appsRes, profileRows, subsRes, roleRows] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("id", { count: "exact", head: true })
          .is("payment_confirmed_at", null),
        fetchAllRows<{
          user_id: string;
          complimentary_access: boolean | null;
          access_restricted: boolean | null;
        }>((from, to) =>
          supabase
            .from("profiles")
            .select("user_id, complimentary_access, access_restricted")
            .eq("international_block", false)
            .range(from, to),
        ),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, status, current_period_end"),
        fetchAllRows<{ user_id: string; role: string }>((from, to) =>
          supabase.from("user_roles").select("user_id, role").range(from, to),
        ),
      ]);

      const privileged = new Set(
        roleRows.filter((r) => r.role !== "consumer").map((r) => r.user_id),
      );
      const activeSub = new Set<string>();
      for (const s of subsRes.data ?? []) {
        const ok =
          (s.status === "active" || s.status === "trialing") &&
          (!s.current_period_end || new Date(s.current_period_end) > new Date());
        if (ok) activeSub.add(s.user_id);
      }

      let incompleteMembers = 0;
      for (const rec of profileRows) {
        if (rec.complimentary_access) continue;
        if (rec.access_restricted) continue;
        if (privileged.has(rec.user_id)) continue;
        if (activeSub.has(rec.user_id)) continue;
        incompleteMembers++;
      }

      return {
        incompleteApplications: appsRes.count ?? 0,
        incompleteMembers,
      };
    },
  });
}
