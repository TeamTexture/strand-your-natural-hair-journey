import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useRoles";

/**
 * Admin-only funnel drop-off counts.
 *
 * incompleteApplications — pro_applications rows with no payment_confirmed_at:
 *   the resumable-draft / never-submitted pile from /pro/auth signups.
 *
 * incompleteMembers      — consumer accounts that have registered but never
 *   crossed the paywall: no active/trialing consumer_subscriptions row,
 *   complimentary_access = false, access_restricted = false, and no
 *   professional/admin role.
 */
export function useAdminDropOffCounts() {
  const { isAdmin } = useRoles();
  return useQuery({
    queryKey: ["admin", "dropoff-counts"],
    enabled: isAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [appsRes, profilesRes, subsRes, rolesRes] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("id", { count: "exact", head: true })
          .is("payment_confirmed_at", null),
        supabase
          .from("profiles")
          .select("user_id, complimentary_access, access_restricted")
          .limit(2000),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, status, current_period_end"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      const privileged = new Set<string>();
      for (const r of rolesRes.data ?? []) {
        if (r.role === "admin" || r.role === "professional") privileged.add(r.user_id);
      }
      const activeSub = new Set<string>();
      for (const s of subsRes.data ?? []) {
        const ok =
          (s.status === "active" || s.status === "trialing") &&
          (!s.current_period_end || new Date(s.current_period_end) > new Date());
        if (ok) activeSub.add(s.user_id);
      }

      let incompleteMembers = 0;
      for (const p of profilesRes.data ?? []) {
        const rec = p as {
          user_id: string;
          complimentary_access?: boolean | null;
          access_restricted?: boolean | null;
        };
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
