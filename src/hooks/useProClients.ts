import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProClientRow {
  access_id: string;
  consumer_id: string;
  granted_at: string;
  revoked_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  appointment_count: number;
  last_appointment_date: string | null;
  next_appointment_date: string | null;
  last_view_at: string | null;
  note_count: number;
}

/**
 * Load the professional's full client book — every consumer they hold an
 * access grant for, past or present. Enriched with:
 *  - profile display name + avatar
 *  - linked-appointment history with this pro (count, last, next)
 *  - most recent passport view timestamp (for "activity" sorting)
 *  - private note count (for the "My notes" surface)
 *
 * All follow-up queries are batched by id list. Nothing crosses privacy
 * boundaries: appointments only join via `linked_pro_user_id`, and notes are
 * scoped by RLS to `auth.uid()`.
 */
export const useProClients = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro-clients", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<ProClientRow[]> => {
      const proId = user!.id;
      const { data: access, error } = await supabase
        .from("pro_client_access")
        .select("id,consumer_id,granted_at,revoked_at")
        .eq("pro_user_id", proId)
        .order("granted_at", { ascending: false });
      if (error) throw error;
      const rows = access ?? [];
      if (rows.length === 0) return [];

      const consumerIds = Array.from(new Set(rows.map((r) => r.consumer_id)));

      // Profiles for names/avatars. RLS: pro can read profiles of active
      // clients only; past-client rows will simply come back without a
      // profile, which is fine — we already show name/dates only for those.
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,display_name,avatar_url")
        .in("user_id", consumerIds);
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p]),
      );

      // Appointments linked to this pro for these consumers.
      const today = new Date().toISOString().slice(0, 10);
      const { data: appts } = await supabase
        .from("appointments")
        .select("user_id,appointment_date,status")
        .eq("linked_pro_user_id", proId)
        .in("user_id", consumerIds);
      const apptAgg = new Map<
        string,
        { count: number; last: string | null; next: string | null }
      >();
      for (const a of appts ?? []) {
        const bucket = apptAgg.get(a.user_id) ?? { count: 0, last: null, next: null };
        bucket.count += 1;
        const terminal = ["completed", "cancelled", "no_show"].includes(a.status ?? "");
        if (terminal || a.appointment_date < today) {
          if (!bucket.last || a.appointment_date > bucket.last) bucket.last = a.appointment_date;
        } else {
          if (!bucket.next || a.appointment_date < bucket.next) bucket.next = a.appointment_date;
        }
        apptAgg.set(a.user_id, bucket);
      }

      // Last passport view per consumer.
      const { data: views } = await supabase
        .from("pro_passport_views")
        .select("consumer_id,viewed_at")
        .eq("pro_user_id", proId)
        .in("consumer_id", consumerIds)
        .order("viewed_at", { ascending: false });
      const viewMap = new Map<string, string>();
      for (const v of views ?? []) {
        if (!viewMap.has(v.consumer_id)) viewMap.set(v.consumer_id, v.viewed_at);
      }

      // Private-note counts per consumer (own-notes, RLS-scoped).
      const { data: notes } = await supabase
        .from("pro_client_notes")
        .select("consumer_id")
        .eq("pro_user_id", proId)
        .in("consumer_id", consumerIds);
      const noteCounts = new Map<string, number>();
      for (const n of notes ?? []) {
        noteCounts.set(n.consumer_id, (noteCounts.get(n.consumer_id) ?? 0) + 1);
      }

      return rows.map((r) => {
        const p = profileMap.get(r.consumer_id);
        const a = apptAgg.get(r.consumer_id);
        return {
          access_id: r.id,
          consumer_id: r.consumer_id,
          granted_at: r.granted_at,
          revoked_at: r.revoked_at,
          display_name: p?.display_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          appointment_count: a?.count ?? 0,
          last_appointment_date: a?.last ?? null,
          next_appointment_date: a?.next ?? null,
          last_view_at: viewMap.get(r.consumer_id) ?? null,
          note_count: noteCounts.get(r.consumer_id) ?? 0,
        };
      });
    },
  });
};
