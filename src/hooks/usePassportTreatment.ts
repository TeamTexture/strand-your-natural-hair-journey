import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  type EntryRow,
  type ScheduleRow,
  computeAdherence,
  todayKey,
  weekNumberFor,
  weekRange,
  expectedOccurrences,
} from "@/lib/treatmentSchedule";
import type { CheckinMediaRow } from "@/components/treatment/CheckinReview";

/**
 * Treatment plans as seen from inside the client passport.
 *
 * The passport is NOT a second door. public.passport_treatment_plans returns
 * plan content only where has_accepted_plan_access passes, and media only where
 * has_media_access passes. Every other plan comes back as title and status only,
 * which is exactly what this hook can surface. Neither helper was changed and no
 * RLS policy was added for this view.
 */

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface PassportCheckin {
  id: string;
  week_number: number;
  submitted_at: string | null;
  ratings: Record<string, number>;
  written_note: string | null;
  media: CheckinMediaRow[];
}

export interface PassportPlanWeek {
  week: number;
  due: number;
  logged: number;
  percent: number;
}

export interface PassportPlan {
  plan_id: string;
  title: string;
  status: string;
  start_date: string;
  duration_weeks: number;
  has_plan_access: boolean;
  has_media_access: boolean;
  schedule: ScheduleRow[];
  entries: EntryRow[];
  checkins: PassportCheckin[];
  products: { id: string; product_name: string; brand: string | null }[];
  /* derived, only meaningful when has_plan_access */
  weekNumber: number;
  adherencePercent: number;
  adherenceLine: string;
  weeks: PassportPlanWeek[];
}

function weekBreakdown(
  schedule: ScheduleRow[],
  entries: EntryRow[],
  startDate: string,
  durationWeeks: number,
  currentWeek: number,
): PassportPlanWeek[] {
  const out: PassportPlanWeek[] = [];
  for (let w = 1; w <= Math.min(durationWeeks, Math.max(1, currentWeek)); w++) {
    const { start, end } = weekRange(startDate, w);
    const due = expectedOccurrences(schedule, startDate, start, end);
    const logged = entries.filter(
      (e) => e.entry_date >= start && e.entry_date <= end && e.status === "completed",
    ).length;
    out.push({
      week: w,
      due,
      logged,
      percent: due > 0 ? Math.min(100, Math.round((logged / due) * 100)) : 0,
    });
  }
  return out.reverse();
}

function derive(row: any): PassportPlan {
  const schedule = (row.schedule ?? []) as ScheduleRow[];
  const entries = (row.entries ?? []) as EntryRow[];
  const week = Math.max(
    1,
    Math.min(row.duration_weeks, weekNumberFor(row.start_date, todayKey())),
  );
  const a = row.has_plan_access
    ? computeAdherence(schedule, entries, row.start_date)
    : { percent: 0, line: "" };
  return {
    ...row,
    schedule,
    entries,
    checkins: (row.checkins ?? []) as PassportCheckin[],
    products: (row.products ?? []) as PassportPlan["products"],
    weekNumber: week,
    adherencePercent: a.percent,
    adherenceLine: a.line,
    weeks: row.has_plan_access
      ? weekBreakdown(schedule, entries, row.start_date, row.duration_weeks, week)
      : [],
  } as PassportPlan;
}

export function usePassportTreatment(clientUserId?: string, enabled = true) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["passport-treatment", clientUserId, user?.id],
    enabled: enabled && !!clientUserId && !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<PassportPlan[]> => {
      const { data, error } = await db.rpc("passport_treatment_plans", {
        _client: clientUserId,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map(derive);
    },
  });
  return { plans: q.data ?? [], loading: q.isLoading };
}
