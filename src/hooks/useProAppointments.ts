import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProAppointmentRow {
  id: string;
  user_id: string;
  professional_name: string;
  professional_type: string | null;
  clinic_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  notes: string | null;
  outcome_notes: string | null;
  status: string;
  linked_pro_user_id: string | null;
  updated_at: string | null;
  // Denormalised client display, filled after a follow-up profile fetch.
  client_display_name: string | null;
  client_avatar_url: string | null;
}

/**
 * Fetch every appointment linked to the signed-in professional.
 * RLS enforces linkage + active consent + active subscription — no extra
 * filtering needed here, but we still sort in JS so the pro sees the
 * soonest-first upcoming stack.
 *
 * Client display names come from the shared `profiles` table (accessible via
 * the pro's existing consent grant), and are stitched in as a follow-up read.
 */
export const useProAppointments = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pro-appointments", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<ProAppointmentRow[]> => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,user_id,professional_name,professional_type,clinic_name,appointment_date,appointment_time,reason,notes,outcome_notes,status,linked_pro_user_id,updated_at",
        )
        .eq("linked_pro_user_id", user!.id)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Omit<ProAppointmentRow, "client_display_name" | "client_avatar_url">[];
      if (rows.length === 0) return [];

      const consumerIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,display_name,avatar_url")
        .in("user_id", consumerIds);
      const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>(
        (profiles ?? []).map((p) => [
          p.user_id,
          { display_name: p.display_name, avatar_url: p.avatar_url },
        ]),
      );

      return rows.map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          ...r,
          client_display_name: p?.display_name ?? null,
          client_avatar_url: p?.avatar_url ?? null,
        };
      });
    },
  });
};

/** Count of upcoming (future, non-terminal) appointments linked to the pro. */
export const useUpcomingProAppointmentsCount = () => {
  const { data = [] } = useProAppointments();
  const today = new Date().toISOString().slice(0, 10);
  return data.filter(
    (a) =>
      !["completed", "cancelled", "no_show"].includes(a.status) &&
      a.appointment_date >= today,
  ).length;
};
