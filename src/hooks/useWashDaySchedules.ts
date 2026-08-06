import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type GoogleCalendarState = "not_asked" | "confirmed" | "declined";
export type WashDayScheduleStatus = "scheduled" | "completed" | "cancelled";

export interface WashDaySchedule {
  id: string;
  user_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  google_calendar_state: GoogleCalendarState;
  google_calendar_asked_at: string | null;
  google_calendar_answered_at: string | null;
  status: WashDayScheduleStatus;
  completed_wash_day_id: string | null;
  created_at: string;
  updated_at: string;
}

const pad = (n: number) => n.toString().padStart(2, "0");
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const useWashDaySchedules = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["wash-day-schedules", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<WashDaySchedule[]> => {
      const { data, error } = await supabase
        .from("wash_day_schedules")
        .select("*")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WashDaySchedule[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async (input: { date: string; time?: string | null }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("wash_day_schedules")
        .insert({
          user_id: user.id,
          scheduled_date: input.date,
          scheduled_time: input.time?.trim() ? input.time : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as WashDaySchedule;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      date?: string;
      time?: string | null;
      status?: WashDayScheduleStatus;
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.date) patch.scheduled_date = input.date;
      if (input.time !== undefined) patch.scheduled_time = input.time?.trim() ? input.time : null;
      if (input.status) patch.status = input.status;
      const { error } = await supabase
        .from("wash_day_schedules")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Records that the Google Calendar link was opened for this schedule. */
  const markCalendarAsked = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("wash_day_schedules")
        .update({ google_calendar_asked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Records the member's answer to "Have you added it to your Google Calendar?" */
  const answerCalendar = useMutation({
    mutationFn: async (input: { id: string; state: Exclude<GoogleCalendarState, "not_asked"> }) => {
      const { error } = await supabase
        .from("wash_day_schedules")
        .update({
          google_calendar_state: input.state,
          google_calendar_answered_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wash_day_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const schedules = query.data ?? [];
  const iso = todayIso();
  const upcoming = schedules
    .filter((s) => s.status === "scheduled" && s.scheduled_date >= iso)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  return {
    schedules,
    upcoming,
    /** The soonest active schedule, which the Next wash day box tracks. */
    activeSchedule: upcoming[0] ?? null,
    loading: query.isLoading,
    create,
    update,
    markCalendarAsked,
    answerCalendar,
    remove,
  };
};
