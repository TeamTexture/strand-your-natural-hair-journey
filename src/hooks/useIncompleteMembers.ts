import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IncompleteMemberRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  last_session: string | null;
  session_count: number;
  sessions_last_30d: number;
  progress: {
    profile: boolean;
    hair: boolean;
    health: boolean;
    style: boolean;
    blood: boolean;
  };
  completed: number; // 0..5
}

/**
 * Consumer accounts that registered but never paid — no active/trialing
 * Stripe subscription, complimentary_access = false, access_restricted =
 * false, and no professional/admin role. Includes per-user onboarding
 * progress derived from data presence.
 */
export function useIncompleteMembers() {
  return useQuery({
    queryKey: ["admin", "members", "incomplete"],
    queryFn: async (): Promise<IncompleteMemberRow[]> => {
      const [profilesRes, subsRes, rolesRes, emailsRes, activityRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "user_id, display_name, complimentary_access, access_restricted, created_at, birth_year, heritage",
          )
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, status, current_period_end"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.rpc("admin_list_member_emails"),
        supabase.rpc("admin_list_member_activity"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (emailsRes.error) throw emailsRes.error;
      if (activityRes.error) throw activityRes.error;

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
      const emailMap = new Map(
        ((emailsRes.data ?? []) as Array<{ user_id: string; email: string | null }>).map((e) => [
          e.user_id,
          e.email,
        ]),
      );
      const activityMap = new Map(
        ((activityRes.data ?? []) as Array<{
          user_id: string;
          session_count: number | string;
          last_session: string | null;
          sessions_last_30d: number | string;
        }>).map((a) => [a.user_id, {
          session_count: Number(a.session_count) || 0,
          last_session: a.last_session,
          sessions_last_30d: Number(a.sessions_last_30d) || 0,
        }]),
      );

      const candidates = (profilesRes.data ?? []).filter((p) => {
        const rec = p as {
          user_id: string;
          complimentary_access?: boolean | null;
          access_restricted?: boolean | null;
        };
        if (rec.complimentary_access) return false;
        if (rec.access_restricted) return false;
        if (privileged.has(rec.user_id)) return false;
        if (activeSub.has(rec.user_id)) return false;
        return true;
      });

      if (candidates.length === 0) return [];

      const ids = candidates.map((c) => (c as { user_id: string }).user_id);

      const [hairRes, healthRes, styleRes, bloodPanelsRes, bloodResultsRes] = await Promise.all([
        supabase.from("user_hair_profile").select("user_id").in("user_id", ids),
        supabase.from("user_health_profile").select("user_id").in("user_id", ids),
        supabase.from("user_style_profile").select("user_id").in("user_id", ids),
        supabase.from("blood_panels").select("user_id").in("user_id", ids),
        supabase.from("blood_results").select("user_id").in("user_id", ids),
      ]);

      const hairSet = new Set((hairRes.data ?? []).map((r) => r.user_id));
      const healthSet = new Set((healthRes.data ?? []).map((r) => r.user_id));
      const styleSet = new Set((styleRes.data ?? []).map((r) => r.user_id));
      const bloodSet = new Set([
        ...(bloodPanelsRes.data ?? []).map((r) => r.user_id),
        ...(bloodResultsRes.data ?? []).map((r) => r.user_id),
      ]);

      return candidates.map((p) => {
        const rec = p as {
          user_id: string;
          display_name: string | null;
          created_at: string;
          birth_year: number | null;
          heritage: string[] | null;
        };
        const act = activityMap.get(rec.user_id);
        const profileFilled =
          !!rec.display_name || !!rec.birth_year || !!(rec.heritage && rec.heritage.length);
        const progress = {
          profile: profileFilled,
          hair: hairSet.has(rec.user_id),
          health: healthSet.has(rec.user_id),
          style: styleSet.has(rec.user_id),
          blood: bloodSet.has(rec.user_id),
        };
        const completed = Object.values(progress).filter(Boolean).length;
        return {
          user_id: rec.user_id,
          display_name: rec.display_name,
          email: emailMap.get(rec.user_id) ?? null,
          created_at: rec.created_at,
          last_session: act?.last_session ?? null,
          session_count: act?.session_count ?? 0,
          sessions_last_30d: act?.sessions_last_30d ?? 0,
          progress,
          completed,
        };
      });
    },
  });
}
