import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import {
  type EntryRow,
  type ScheduleRow,
  type TreatmentCadence,
  type TreatmentTimeOfDay,
  computeAdherence,
  todayKey,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/**
 * STRAND admin side of treatment plans. Mirrors the professional side, with two
 * differences that matter:
 *  - templates and assignments are admin-owned (owner_type / assigner_type
 *    'admin', professional_id null, per the CHECK constraints);
 *  - media stays consent-gated. has_media_access binds admins exactly as it
 *    binds professionals, so there is no override anywhere in here.
 */

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type PlanSource = "admin" | "professional" | "self";

export interface AdminProTag {
  id: string;
  professional_id: string;
  label: string | null;
  professional_name: string;
}

export interface AdminPlanRow {
  plan_id: string;
  created_at: string;
  title: string;
  start_date: string;
  duration_weeks: number;
  status: string;
  owner_user_id: string;
  owner_name: string;
  source: PlanSource;
  assigner_name: string | null;
  media_sharing_consent: boolean;
  schedule: ScheduleRow[];
  entries: EntryRow[];
  pro_tags: AdminProTag[];
  /* derived */
  weekNumber: number;
  adherencePercent: number;
  adherenceLine: string;
}

function derive(row: any): AdminPlanRow {
  const schedule = (row.schedule ?? []) as ScheduleRow[];
  const entries = (row.entries ?? []) as EntryRow[];
  const a = computeAdherence(schedule, entries, row.start_date);
  const week = Math.max(
    1,
    Math.min(row.duration_weeks, weekNumberFor(row.start_date, todayKey())),
  );
  return {
    ...row,
    schedule,
    entries,
    pro_tags: (row.pro_tags ?? []) as AdminProTag[],
    weekNumber: week,
    adherencePercent: a.percent,
    adherenceLine: a.line,
  } as AdminPlanRow;
}

export function useAdminPlans() {
  const { isAdmin } = useRoles();
  const q = useQuery({
    queryKey: ["admin-treatment-plans"],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminPlanRow[]> => {
      const { data, error } = await db.rpc("admin_treatment_plans");
      if (error) throw error;
      return ((data ?? []) as any[]).map(derive);
    },
  });
  return { plans: q.data ?? [], loading: q.isLoading };
}

export function useAdminPlan(planId?: string) {
  const { plans, loading } = useAdminPlans();
  const plan = useMemo(() => plans.find((p) => p.plan_id === planId) ?? null, [plans, planId]);
  return { plan, loading };
}

/* ------------------------------------------------------------ pro tagging */

export interface ProfessionalOption {
  user_id: string;
  display_name: string;
  discipline: string | null;
}

export function useProfessionalOptions(enabled = true) {
  const { isAdmin } = useRoles();
  const q = useQuery({
    queryKey: ["admin-professional-options"],
    enabled: enabled && isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfessionalOption[]> => {
      const { data, error } = await db.rpc("admin_professional_options");
      if (error) throw error;
      return (data ?? []) as ProfessionalOption[];
    },
  });
  return { professionals: q.data ?? [], loading: q.isLoading };
}

export function usePlanProTagActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-treatment-plans"] });

  const add = useMutation({
    mutationFn: async (v: { planId: string; professionalId: string; label: string }) => {
      const { error } = await db.from("treatment_plan_professional_tags").insert({
        plan_id: v.planId,
        professional_id: v.professionalId,
        label: v.label.trim() || null,
        tagged_by_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("treatment_plan_professional_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, remove };
}

/* -------------------------------------------------------- admin templates */

export interface AdminTemplateStep {
  id?: string;
  task_name: string;
  instructions: string;
  cadence: TreatmentCadence;
  days_of_week: number[];
  time_of_day: TreatmentTimeOfDay;
}

export interface AdminTemplate {
  id: string;
  title: string;
  description: string | null;
  duration_weeks: number;
  milestone_weeks: number[] | null;
  steps: AdminTemplateStep[];
  usedWith: number;
}

export function useAdminTemplates() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const q = useQuery({
    queryKey: ["admin-treatment-templates", user?.id],
    enabled: !!user?.id && isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminTemplate[]> => {
      const { data, error } = await db
        .from("treatment_plan_templates")
        .select("id, title, description, duration_weeks, milestone_weeks")
        .eq("owner_type", "admin")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as any[];
      if (!list.length) return [];
      const ids = list.map((t) => t.id);
      const [steps, assignments] = await Promise.all([
        db
          .from("treatment_plan_template_steps")
          .select("*")
          .in("template_id", ids)
          .order("step_order"),
        db.from("treatment_plan_assignments").select("template_id").in("template_id", ids),
      ]);
      const counts = new Map<string, number>();
      for (const a of (assignments.data ?? []) as any[]) {
        counts.set(a.template_id, (counts.get(a.template_id) ?? 0) + 1);
      }
      return list.map((t) => ({
        ...t,
        usedWith: counts.get(t.id) ?? 0,
        steps: ((steps.data ?? []) as any[])
          .filter((s) => s.template_id === t.id)
          .map((s) => ({
            id: s.id,
            task_name: s.task_name,
            instructions: s.instructions ?? "",
            cadence: s.cadence,
            days_of_week: s.days_of_week ?? [],
            time_of_day: s.time_of_day,
          })),
      })) as AdminTemplate[];
    },
  });
  return { templates: q.data ?? [], loading: q.isLoading };
}

export function useSaveAdminTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      title: string;
      description?: string;
      duration_weeks: number;
      milestone_weeks: number[];
      steps: AdminTemplateStep[];
    }): Promise<string> => {
      // owner_type 'admin' requires professional_id null — the owner_shape CHECK.
      const payload = {
        owner_user_id: user!.id,
        owner_type: "admin",
        professional_id: null,
        title: v.title.trim(),
        description: v.description?.trim() || null,
        duration_weeks: v.duration_weeks,
        milestone_weeks: v.milestone_weeks,
      };
      let id = v.id;
      if (id) {
        const { error } = await db.from("treatment_plan_templates").update(payload).eq("id", id);
        if (error) throw error;
        const del = await db.from("treatment_plan_template_steps").delete().eq("template_id", id);
        if (del.error) throw del.error;
      } else {
        const { data, error } = await db
          .from("treatment_plan_templates")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id as string;
      }
      if (v.steps.length) {
        const { error } = await db.from("treatment_plan_template_steps").insert(
          v.steps.map((s, i) => ({
            template_id: id,
            task_name: s.task_name.trim(),
            instructions: s.instructions.trim() || null,
            cadence: s.cadence,
            days_of_week: s.cadence === "specific_days" ? s.days_of_week : [],
            time_of_day: s.time_of_day,
            step_order: i,
          })),
        );
        if (error) throw error;
      }
      return id!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-treatment-templates"] });
    },
  });
}

export function useAssignAdminTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { templateId: string; clientUserId?: string; email?: string }) => {
      const { data, error } = await db.rpc("assign_treatment_template", {
        _template_id: v.templateId,
        _client_user_id: v.clientUserId ?? null,
        _invited_email: v.email ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-treatment-templates"] });
      void qc.invalidateQueries({ queryKey: ["admin-treatment-plans"] });
    },
  });
}

/** Members an admin can assign a plan to. */
export interface AdminMemberOption {
  user_id: string;
  name: string;
  email: string | null;
}

export function useAdminMemberOptions(enabled = true) {
  const { isAdmin } = useRoles();
  const q = useQuery({
    queryKey: ["admin-member-options"],
    enabled: enabled && isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AdminMemberOption[]> => {
      const [profiles, emails] = await Promise.all([
        db.from("profiles").select("user_id, display_name"),
        db.rpc("admin_list_member_emails"),
      ]);
      const emailBy = new Map<string, string>();
      for (const r of ((emails as any).data ?? []) as any[]) emailBy.set(r.user_id, r.email);
      return (((profiles as any).data ?? []) as any[])
        .map((p) => ({
          user_id: p.user_id as string,
          name: (p.display_name as string) || emailBy.get(p.user_id) || "Member",
          email: emailBy.get(p.user_id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  return { members: q.data ?? [], loading: q.isLoading };
}
