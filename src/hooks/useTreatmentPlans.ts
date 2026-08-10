import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  type EntryRow,
  type ScheduleRow,
  type TreatmentSlot,
  computeAdherence,
  currentStreak,
  dueSlotsOn,
  streakDays,
  todayKey,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/**
 * Treatment plan data access. Every adherence figure here is derived through
 * src/lib/treatmentSchedule.ts — this hook never does its own date maths.
 */

export type PlanStatus = "draft" | "active" | "paused" | "completed" | "abandoned";

export interface TreatmentPlanRow {
  id: string;
  user_id: string;
  title: string;
  goal: string | null;
  start_date: string;
  end_date: string | null;
  duration_weeks: number;
  status: PlanStatus;
  professional_id: string | null;
  notes: string | null;
  reminder_frequency: "off" | "daily" | "weekly";
  reminder_weekday: number;
  reminder_hour: number;
  reminder_timezone: string | null;
}

export interface ProductRow {
  id: string;
  plan_id: string;
  product_name: string;
  brand: string | null;
  usage_notes: string | null;
  step_order: number;
  ingredient_id: string | null;
  user_product_id: string | null;
  image_url: string | null;
}

export interface MilestoneRow {
  id: string;
  plan_id: string;
  week_number: number;
  label: string;
  prompt: string | null;
  completed_at: string | null;
}

export interface PlanBundle {
  plan: TreatmentPlanRow;
  schedule: ScheduleRow[];
  products: ProductRow[];
  entries: EntryRow[];
  milestones: MilestoneRow[];
}

const db = supabase as unknown as {
  from: (t: string) => any;
};

async function loadBundles(userId: string, statuses: PlanStatus[]): Promise<PlanBundle[]> {
  const { data: plans, error } = await db
    .from("treatment_plans")
    .select("id, user_id, title, goal, start_date, end_date, duration_weeks, status, professional_id, notes, reminder_frequency, reminder_weekday, reminder_hour, reminder_timezone")
    .eq("user_id", userId)
    .in("status", statuses)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = (plans ?? []) as TreatmentPlanRow[];
  if (!list.length) return [];
  const ids = list.map((p) => p.id);

  const [schedule, products, entries, milestones] = await Promise.all([
    db.from("treatment_plan_schedule").select("*").in("plan_id", ids).order("step_order"),
    db.from("treatment_plan_products").select("*").in("plan_id", ids).order("step_order"),
    db.from("treatment_plan_entries").select("*").in("plan_id", ids),
    db.from("treatment_plan_milestones").select("*").in("plan_id", ids).order("week_number"),
  ]);

  return list.map((plan) => ({
    plan,
    schedule: ((schedule.data ?? []) as ScheduleRow[]).filter((r) => r.plan_id === plan.id),
    products: ((products.data ?? []) as ProductRow[]).filter((r) => r.plan_id === plan.id),
    entries: ((entries.data ?? []) as EntryRow[]).filter((r) => r.plan_id === plan.id),
    milestones: ((milestones.data ?? []) as MilestoneRow[]).filter((r) => r.plan_id === plan.id),
  }));
}

/** Active plans only — what the Today card on the dashboard renders. */
export function useActiveTreatmentPlans() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-plans", user?.id, "active"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => loadBundles(user!.id, ["active"]),
  });
  return { bundles: q.data ?? [], loading: q.isLoading, refetch: q.refetch };
}

/** Every plan the member owns, for the plans list / detail navigation. */
export function useAllTreatmentPlans() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-plans", user?.id, "all"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => loadBundles(user!.id, ["draft", "active", "paused", "completed", "abandoned"]),
  });
  return { bundles: q.data ?? [], loading: q.isLoading, refetch: q.refetch };
}

export function useTreatmentPlan(planId?: string) {
  const { bundles, loading, refetch } = useAllTreatmentPlans();
  const bundle = useMemo(() => bundles.find((b) => b.plan.id === planId), [bundles, planId]);
  return { bundle, loading, refetch };
}

/** Steps due today across every active plan, with any logged entry attached. */
export interface DueStep {
  key: string;
  plan: TreatmentPlanRow;
  row: ScheduleRow;
  slot: TreatmentSlot;
  entry?: EntryRow;
  week: number;
  /** The plan product this step uses, when one is attached. */
  product?: ProductRow;
}

export function useDueToday() {
  const { bundles, loading } = useActiveTreatmentPlans();
  const today = todayKey();

  const steps: DueStep[] = useMemo(() => {
    const out: DueStep[] = [];
    for (const b of bundles) {
      for (const { row, slot } of dueSlotsOn(b.schedule, b.plan.start_date, today)) {
        out.push({
          key: `${row.id}:${slot}`,
          plan: b.plan,
          row,
          slot,
          week: weekNumberFor(b.plan.start_date, today),
          product: b.products.find((p) => p.id === row.product_id),
          entry: b.entries.find(
            (e) => e.schedule_id === row.id && e.entry_date === today && e.time_of_day === slot,
          ),
        });
      }
    }
    // Morning first, then order the member set on the plan.
    return out.sort(
      (a, b) =>
        (a.slot === b.slot ? 0 : a.slot === "morning" ? -1 : 1) || a.row.step_order - b.row.step_order,
    );
  }, [bundles, today]);

  /** Streak line across the active plans, e.g. "18 of 21 evenings logged". */
  const streakLine = useMemo(() => {
    if (!bundles.length) return "";
    const rows = bundles.flatMap((b) => b.schedule);
    const entries = bundles.flatMap((b) => b.entries);
    // Anchored on the earliest active start date so one line covers them all.
    const start = bundles
      .map((b) => b.plan.start_date)
      .sort()[0];
    return computeAdherence(rows, entries, start).line;
  }, [bundles]);

  /** Gamified streak state across the active plans. */
  const allEntries = useMemo(() => bundles.flatMap((b) => b.entries), [bundles]);
  const streak = useMemo(() => currentStreak(allEntries, today), [allEntries, today]);
  const days = useMemo(() => streakDays(allEntries, 7, today), [allEntries, today]);

  return { steps, streakLine, streak, days, loading, hasActivePlan: bundles.length > 0 };
}

/* ------------------------------------------------------------- mutations */

export function useLogTreatmentStep() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] });
  }, [qc, user?.id]);

  /** One tap, no confirmation. Optimistic; rolls back on error. */
  const log = useMutation({
    mutationFn: async (v: {
      planId: string;
      scheduleId: string;
      slot: TreatmentSlot;
      status: "completed" | "skipped";
      date?: string;
      note?: string;
    }) => {
      const entry_date = v.date ?? todayKey();
      const { error } = await db.from("treatment_plan_entries").upsert(
        {
          plan_id: v.planId,
          schedule_id: v.scheduleId,
          user_id: user!.id,
          entry_date,
          time_of_day: v.slot,
          status: v.status,
          note: v.note?.trim() || null,
          completed_at: v.status === "completed" ? new Date().toISOString() : null,
        },
        { onConflict: "schedule_id,entry_date,time_of_day" },
      );
      if (error) throw error;
    },
    onMutate: async (v) => {
      const key = ["treatment-plans", user?.id];
      await qc.cancelQueries({ queryKey: key });
      const snapshots = qc.getQueriesData({ queryKey: key });
      const entry_date = v.date ?? todayKey();
      qc.setQueriesData({ queryKey: key }, (old: PlanBundle[] | undefined) =>
        (old ?? []).map((b) =>
          b.plan.id !== v.planId
            ? b
            : {
                ...b,
                entries: [
                  ...b.entries.filter(
                    (e) =>
                      !(
                        e.schedule_id === v.scheduleId &&
                        e.entry_date === entry_date &&
                        e.time_of_day === v.slot
                      ),
                  ),
                  {
                    id: `optimistic-${v.scheduleId}-${v.slot}`,
                    plan_id: v.planId,
                    schedule_id: v.scheduleId,
                    entry_date,
                    time_of_day: v.slot,
                    status: v.status,
                    note: v.note?.trim() || null,
                    completed_at: v.status === "completed" ? new Date().toISOString() : null,
                  },
                ],
              },
        ),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: invalidate,
  });

  /** Undo — removes the log entirely so the step is due again. */
  const undo = useMutation({
    mutationFn: async (v: { entryId: string }) => {
      const { error } = await db.from("treatment_plan_entries").delete().eq("id", v.entryId);
      if (error) throw error;
    },
    onMutate: async (v) => {
      const key = ["treatment-plans", user?.id];
      const snapshots = qc.getQueriesData({ queryKey: key });
      qc.setQueriesData({ queryKey: key }, (old: PlanBundle[] | undefined) =>
        (old ?? []).map((b) => ({ ...b, entries: b.entries.filter((e) => e.id !== v.entryId) })),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: invalidate,
  });

  return { log, undo };
}

export function useSetPlanStatus() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { planId: string; status: PlanStatus }) => {
      const { error } = await db
        .from("treatment_plans")
        .update({ status: v.status })
        .eq("id", v.planId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] }),
  });
}

/** Change the check-in reminder cadence on an existing plan. */
export function useUpdatePlanReminder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      planId: string;
      frequency: "off" | "daily" | "weekly";
      weekday: number;
      hour: number;
    }) => {
      const { error } = await db
        .from("treatment_plans")
        .update({
          reminder_frequency: v.frequency,
          reminder_weekday: v.weekday,
          reminder_hour: v.hour,
          reminder_timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
        })
        .eq("id", v.planId);
      if (error) throw error;
      if (v.frequency !== "off") {
        await db
          .from("email_preferences")
          .upsert(
            { user_id: user!.id, treatment_checkin_reminders: true },
            { onConflict: "user_id" },
          );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] }),
  });
}

/* -------------------------------------------------------------- creation */

export interface DraftStep {
  task_name: string;
  instructions: string;
  cadence: "daily" | "specific_days" | "weekly";
  days_of_week: number[];
  time_of_day: "morning" | "evening" | "both";
  /** Index into the draft product list, or null. */
  productIndex: number | null;
  /** Optional week window — null on both means the whole plan. */
  start_week?: number | null;
  end_week?: number | null;
}

export interface DraftProduct {
  product_name: string;
  brand: string;
  usage_notes: string;
  ingredient_id: string | null;
  /** Set when the product came from the member's shelf or a scanned link. */
  user_product_id?: string | null;
  image_url?: string | null;
}

export interface DraftPlan {
  title: string;
  goal: string;
  duration_weeks: number;
  start_date: string;
  products: DraftProduct[];
  steps: DraftStep[];
  milestoneWeeks: number[];
  checkinReminder: boolean;
  /** Reminder cadence chosen by the member, in their own local time. */
  reminderFrequency: "off" | "daily" | "weekly";
  reminderWeekday: number;
  reminderHour: number;
}

export function useCreateTreatmentPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (draft: DraftPlan): Promise<string> => {
      const end = new Date(draft.start_date);
      end.setDate(end.getDate() + draft.duration_weeks * 7 - 1);
      const endKey = `${end.getFullYear()}-${`${end.getMonth() + 1}`.padStart(2, "0")}-${`${end.getDate()}`.padStart(2, "0")}`;

      const { data: plan, error } = await db
        .from("treatment_plans")
        .insert({
          user_id: user!.id,
          created_by_user_id: user!.id,
          title: draft.title.trim(),
          goal: draft.goal.trim() || null,
          start_date: draft.start_date,
          end_date: endKey,
          duration_weeks: draft.duration_weeks,
          status: "active",
          reminder_frequency: draft.reminderFrequency,
          reminder_weekday: draft.reminderWeekday,
          reminder_hour: draft.reminderHour,
          reminder_timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
        })
        .select("id")
        .single();
      if (error) throw error;
      const planId = (plan as { id: string }).id;

      // Products first — schedule rows may reference them.
      let productIds: string[] = [];
      if (draft.products.length) {
        const { data: inserted, error: pErr } = await db
          .from("treatment_plan_products")
          .insert(
            draft.products.map((p, i) => ({
              plan_id: planId,
              product_name: p.product_name.trim(),
              brand: p.brand.trim() || null,
              usage_notes: p.usage_notes.trim() || null,
              step_order: i,
              ingredient_id: p.ingredient_id,
              user_product_id: p.user_product_id ?? null,
              image_url: p.image_url ?? null,
            })),
          )
          .select("id");
        if (pErr) throw pErr;
        productIds = ((inserted ?? []) as { id: string }[]).map((r) => r.id);
      }

      if (draft.steps.length) {
        const { error: sErr } = await db.from("treatment_plan_schedule").insert(
          draft.steps.map((s, i) => ({
            plan_id: planId,
            task_name: s.task_name.trim(),
            instructions: s.instructions.trim() || null,
            cadence: s.cadence,
            days_of_week: s.cadence === "specific_days" ? s.days_of_week : null,
            time_of_day: s.time_of_day,
            product_id:
              s.productIndex != null && productIds[s.productIndex] ? productIds[s.productIndex] : null,
            step_order: i,
            start_week: s.start_week ?? null,
            end_week: s.end_week ?? null,
          })),
        );
        if (sErr) throw sErr;
      }

      if (draft.milestoneWeeks.length) {
        const { error: mErr } = await db.from("treatment_plan_milestones").insert(
          draft.milestoneWeeks.map((w) => ({
            plan_id: planId,
            week_number: w,
            label: `Week ${w} photo`,
            prompt: "Same light, same spot, same parting as last time.",
          })),
        );
        if (mErr) throw mErr;
      }

      // Weekly check-in reminder preference. Sending comes later.
      if (draft.checkinReminder && draft.reminderFrequency !== "off") {
        await db
          .from("email_preferences")
          .upsert(
            { user_id: user!.id, treatment_checkin_reminders: true },
            { onConflict: "user_id" },
          );
      }

      return planId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] }),
  });
}

/** Ingredient autocomplete against the existing glossary. */
export async function searchGlossary(term: string) {
  const q = term.trim();
  if (q.length < 3) return [];
  const { data } = await db
    .from("glossary_terms")
    .select("id, display_name, category")
    .ilike("display_name", `%${q}%`)
    .limit(5);
  return (data ?? []) as { id: string; display_name: string; category: string | null }[];
}

/* ---------------------------------------------------- editing the schedule */

export interface StepInput {
  task_name: string;
  instructions: string | null;
  cadence: "daily" | "specific_days" | "weekly";
  days_of_week: number[] | null;
  time_of_day: "morning" | "evening" | "both";
  product_id?: string | null;
  start_week?: number | null;
  end_week?: number | null;
}

/**
 * Add, change or drop a step on a live plan — including steps planned for weeks
 * that haven't arrived yet. Past logs are left alone: a step's history stays
 * attached to it, so editing a step never rewrites what she already logged.
 */
export function usePlanScheduleEditor(planId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] });

  const addStep = useMutation({
    mutationFn: async (v: StepInput & { step_order: number }) => {
      const { error } = await db.from("treatment_plan_schedule").insert({
        plan_id: planId,
        task_name: v.task_name.trim(),
        instructions: v.instructions?.trim() || null,
        cadence: v.cadence,
        days_of_week: v.cadence === "specific_days" ? v.days_of_week ?? [] : null,
        time_of_day: v.time_of_day,
        product_id: v.product_id ?? null,
        step_order: v.step_order,
        start_week: v.start_week ?? null,
        end_week: v.end_week ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateStep = useMutation({
    mutationFn: async (v: StepInput & { id: string }) => {
      const { error } = await db
        .from("treatment_plan_schedule")
        .update({
          task_name: v.task_name.trim(),
          instructions: v.instructions?.trim() || null,
          cadence: v.cadence,
          days_of_week: v.cadence === "specific_days" ? v.days_of_week ?? [] : null,
          time_of_day: v.time_of_day,
          product_id: v.product_id ?? null,
          start_week: v.start_week ?? null,
          end_week: v.end_week ?? null,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("treatment_plan_schedule").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addStep, updateStep, removeStep };
}
