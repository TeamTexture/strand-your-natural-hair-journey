import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Application = Database["public"]["Tables"]["pro_applications"]["Row"];

export interface IncompleteProRow {
  app: Application;
  email: string | null;
  last_session: string | null;
  session_count: number;
  progress: "not_started" | "draft_started" | "nearly_ready";
  filled_sections: string[];
}

/** Which application sections a draft has already filled. */
function sectionsFilled(a: Application): string[] {
  const s: string[] = [];
  if (a.full_name && a.discipline) s.push("About you");
  if (a.qualifications || a.insurance_provider || a.insurance_policy_no || a.insurance_expiry)
    s.push("Insurance");
  const anyContact =
    (a as unknown as { business_phone?: string | null; business_email?: string | null }).business_phone ||
    (a as unknown as { business_phone?: string | null; business_email?: string | null }).business_email ||
    (a as unknown as { address_line1?: string | null }).address_line1 ||
    (a as unknown as { city?: string | null }).city ||
    a.location ||
    a.postcode;
  if (anyContact) s.push("Contact & address");
  if ((a as unknown as { opening_hours?: unknown }).opening_hours) s.push("Opening hours");
  if (a.why_strand) s.push("The Strand Council");
  return s;
}

export function useIncompleteProApplications() {
  return useQuery({
    queryKey: ["admin", "pro_applications", "incomplete"],
    queryFn: async (): Promise<IncompleteProRow[]> => {
      const [appsRes, emailsRes, activityRes] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("*")
          .is("payment_confirmed_at", null)
          .order("created_at", { ascending: false }),
        supabase.rpc("admin_list_member_emails"),
        supabase.rpc("admin_list_member_activity"),
      ]);
      if (appsRes.error) throw appsRes.error;
      if (emailsRes.error) throw emailsRes.error;
      if (activityRes.error) throw activityRes.error;

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
        }>).map((a) => [a.user_id, {
          session_count: Number(a.session_count) || 0,
          last_session: a.last_session,
        }]),
      );

      return ((appsRes.data ?? []) as Application[]).map((app) => {
        const filled = sectionsFilled(app);
        const act = app.user_id ? activityMap.get(app.user_id) : undefined;
        const progress: IncompleteProRow["progress"] =
          filled.length >= 4 ? "nearly_ready" : filled.length > 1 ? "draft_started" : "not_started";
        return {
          app,
          email: (app.user_id ? emailMap.get(app.user_id) : null) ?? app.email ?? null,
          last_session: act?.last_session ?? null,
          session_count: act?.session_count ?? 0,
          progress,
          filled_sections: filled,
        };
      });
    },
  });
}
