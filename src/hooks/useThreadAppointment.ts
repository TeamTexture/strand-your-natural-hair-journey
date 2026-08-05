import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upcomingAppointments } from "@/lib/appointmentState";

export interface ThreadAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  service: string | null;
  location_format: string | null;
  clinic_name: string | null;
  professional_name: string;
  status: string;
  notes: string | null;
}

/**
 * The next booked appointment shared by the two people in a thread.
 * Both sides read the SAME row through the SAME "upcoming" accessor, so the
 * chat preview can never disagree with either dashboard.
 */
export const useThreadAppointment = (
  consumerId: string | null | undefined,
  proUserId: string | null | undefined,
) =>
  useQuery({
    queryKey: ["thread-appointment", consumerId, proUserId],
    enabled: !!consumerId && !!proUserId,
    staleTime: 30_000,
    queryFn: async (): Promise<ThreadAppointment | null> => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,appointment_date,appointment_time,reason,service,location_format,clinic_name,professional_name,status,notes",
        )
        .eq("user_id", consumerId!)
        .eq("linked_pro_user_id", proUserId!)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ThreadAppointment[];
      return upcomingAppointments(rows)[0] ?? null;
    },
  });
