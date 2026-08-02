import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface LogAppointmentInput {
  client_user_id: string;
  appointment_date: string; // yyyy-mm-dd
  appointment_time?: string; // HH:MM 24h, optional
  service?: string;
  notes?: string;
  location?: string;
}

/**
 * Professional logs an appointment into the Strand diary for one of their
 * consented clients. The RPC re-checks consent + subscription server-side, so
 * the client never decides who it writes for.
 */
export const useProLogAppointment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogAppointmentInput) => {
      const { data, error } = await supabase.rpc("pro_log_appointment", {
        _client_user_id: input.client_user_id,
        _appointment_date: input.appointment_date,
        _appointment_time: input.appointment_time ?? "",
        _service: input.service ?? "",
        _notes: input.notes ?? "",
        _location: input.location ?? "",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-appointments"] });
      qc.invalidateQueries({ queryKey: ["pro-clients"] });
      qc.invalidateQueries({ queryKey: ["pro-booking-follow-ups"] });
      qc.invalidateQueries({ queryKey: ["chat_messages"] });
    },
  });
};

export interface BookingFollowUp {
  thread_id: string;
  consumer_id: string;
  sent_at: string;
}

/**
 * Booking requests this pro sent in the last 21 days where no appointment has
 * since been logged for that client — the nudge set for "Client booked?".
 */
export const useProBookingFollowUps = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro-booking-follow-ups", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BookingFollowUp[]> => {
      const since = new Date(Date.now() - 21 * 864e5).toISOString();
      const { data: threads, error } = await supabase
        .from("chat_threads")
        .select("id,consumer_id")
        .eq("pro_user_id", user!.id);
      if (error) throw error;
      const rows = (threads ?? []).filter((t) => !!t.consumer_id);
      if (rows.length === 0) return [];

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("thread_id,created_at")
        .in(
          "thread_id",
          rows.map((t) => t.id),
        )
        .or("kind.eq.booking_request,meta->>booking_opened.eq.true")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      // Latest booking request per thread.
      const latest = new Map<string, string>();
      for (const m of msgs ?? []) {
        if (!latest.has(m.thread_id)) latest.set(m.thread_id, m.created_at as string);
      }
      if (latest.size === 0) return [];

      const { data: appts } = await supabase
        .from("appointments")
        .select("user_id,created_at")
        .eq("linked_pro_user_id", user!.id)
        .gte("created_at", since);

      const pending: BookingFollowUp[] = [];
      for (const t of rows) {
        const sentAt = latest.get(t.id);
        if (!sentAt) continue;
        const loggedSince = (appts ?? []).some(
          (a) => a.user_id === t.consumer_id && (a.created_at as string) >= sentAt,
        );
        if (!loggedSince) {
          pending.push({ thread_id: t.id, consumer_id: t.consumer_id as string, sent_at: sentAt });
        }
      }
      return pending.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    },
  });
};
