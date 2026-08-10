import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  type EntryRow,
  type ScheduleRow,
  type TreatmentCadence,
  type TreatmentTimeOfDay,
  computeAdherence,
  daysBetween,
  todayKey,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/**
 * Professional side of treatment plans.
 *
 * Every figure on this side comes from src/lib/treatmentSchedule.ts — the RPC
 * returns raw schedule and entry rows precisely so the maths is not duplicated
 * in SQL. Access is still the accepted assignment: this hook cannot see a plan
 * the client has not accepted, and cannot see media without media consent.
 */

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ClientPlanStatus = "not_started" | "on_track" | "quiet";

export interface ProTreatmentClient {
  assignment_id: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  client_user_id: string | null;
  client_name: string;
  invited_email: string | null;
  media_sharing_consent: boolean;
  template_title: string | null;
  plan: {
    id: string;
    title: string;
    start_date: string;
    duration_weeks: number;
    status: string;
  } | null;
  schedule: ScheduleRow[];
  entries: EntryRow[];
  last_entry_date: string | null;
  checkin_weeks: number[];
  /* derived */
  planStatus: ClientPlanStatus;
  weekNumber: number;
  adherencePercent: number;
  adherenceLine: string;
  quietDays: number;
}

const QUIET_AFTER_DAYS = 4;

function derive(row: any): ProTreatmentClient {
  const plan = row.plan ?? null;
  const schedule = (row.schedule ?? []) as ScheduleRow[];
  const entries = (row.entries ?? []) as EntryRow[];
  const today = todayKey();

  let planStatus: ClientPlanStatus = "not_started";
  let weekNumber = 0;
  let percent = 0;
  let line = "Waiting to accept";
  let quietDays = 0;

  if (row.status === "accepted" && plan) {
    const a = computeAdherence(schedule, entries, plan.start_date);
    percent = a.percent;
    line = a.line;
    weekNumber = Math.max(1, Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, today)));
    const anchor = row.last_entry_date ?? plan.start_date;
    quietDays = Math.max(0, daysBetween(anchor, today));
    planStatus = quietDays >= QUIET_AFTER_DAYS ? "quiet" : "on_track";
  }

  return {
    ...row,
    plan,
    schedule,
    entries,
    checkin_weeks: (row.checkin_weeks ?? []) as number[],
    planStatus,
    weekNumber,
    adherencePercent: percent,
    adherenceLine: line,
    quietDays,
  } as ProTreatmentClient;
}

/** Clients on a plan, ordered so whoever needs attention sits at the top. */
export function useProTreatmentClients() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["pro-treatment-clients", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ProTreatmentClient[]> => {
      const { data, error } = await db.rpc("pro_treatment_clients");
      if (error) throw error;
      return ((data ?? []) as any[]).map(derive);
    },
  });

  const clients = useMemo(() => {
    const rank: Record<ClientPlanStatus, number> = { quiet: 0, not_started: 1, on_track: 2 };
    return [...(q.data ?? [])].sort(
      (a, b) => rank[a.planStatus] - rank[b.planStatus] || b.quietDays - a.quietDays,
    );
  }, [q.data]);

  return { clients, loading: q.isLoading };
}

/* ------------------------------------------------------------- templates */

export interface TemplateStepDraft {
  id?: string;
  task_name: string;
  instructions: string;
  cadence: TreatmentCadence;
  days_of_week: number[];
  time_of_day: TreatmentTimeOfDay;
}

export interface ProTemplate {
  id: string;
  title: string;
  description: string | null;
  duration_weeks: number;
  milestone_weeks: number[] | null;
  steps: TemplateStepDraft[];
  usedWith: number;
}

export function useProTemplates() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["pro-treatment-templates", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ProTemplate[]> => {
      const { data: templates, error } = await db
        .from("treatment_plan_templates")
        .select("id, title, description, duration_weeks, milestone_weeks")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (templates ?? []) as any[];
      if (!list.length) return [];
      const ids = list.map((t) => t.id);
      const [steps, assignments] = await Promise.all([
        db.from("treatment_plan_template_steps").select("*").in("template_id", ids).order("step_order"),
        db.from("treatment_plan_assignments").select("template_id").in("template_id", ids),
      ]);
      const assignedCount = new Map<string, number>();
      for (const a of (assignments.data ?? []) as any[]) {
        assignedCount.set(a.template_id, (assignedCount.get(a.template_id) ?? 0) + 1);
      }
      return list.map((t) => ({
        ...t,
        usedWith: assignedCount.get(t.id) ?? 0,
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
      })) as ProTemplate[];
    },
  });
  return { templates: q.data ?? [], loading: q.isLoading };
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      title: string;
      description?: string;
      duration_weeks: number;
      milestone_weeks: number[];
      steps: TemplateStepDraft[];
    }): Promise<string> => {
      const payload = {
        owner_user_id: user!.id,
        owner_type: "professional",
        professional_id: user!.id,
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
      void qc.invalidateQueries({ queryKey: ["pro-treatment-templates", user?.id] });
    },
  });
}

export function useAssignTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: { templateId: string; clientUserId?: string; email?: string }) => {
      const { data, error } = await db.rpc("assign_treatment_template", {
        _template_id: v.templateId,
        _client_user_id: v.clientUserId ?? null,
        _invited_email: v.email ?? null,
      });
      if (error) throw error;
      // Invitation email. Fire-and-forget: never block the assignment on email.
      void supabase.functions.invoke("treatment-invite-email", {
        body: { assignment_id: data as string },
      });
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pro-treatment-clients", user?.id] });
      void qc.invalidateQueries({ queryKey: ["pro-treatment-templates", user?.id] });
    },
  });
}

/* --------------------------------------------------------- check-in review */

export interface ProCheckinReview {
  checkin: any;
  media: any[];
  mediaShared: boolean;
  clientName: string;
  clientUserId: string | null;
  planTitle: string;
  comments: any[];
}

export function useProCheckinReview(planId?: string, week?: number) {
  const { user } = useAuth();
  const { clients } = useProTreatmentClients();
  const client = clients.find((c) => c.plan?.id === planId) ?? null;

  const q = useQuery({
    queryKey: ["pro-checkin-review", planId, week],
    enabled: !!planId && !!week,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: checkin, error } = await db
        .from("treatment_plan_checkins")
        .select("*")
        .eq("plan_id", planId)
        .eq("week_number", week)
        .maybeSingle();
      if (error) throw error;
      if (!checkin) return { checkin: null, media: [], comments: [] };
      // Media rows only come back at all when media consent is on — the RLS
      // policy is the gate, not this query.
      const [media, comments] = await Promise.all([
        db.from("treatment_plan_media").select("*").eq("checkin_id", checkin.id),
        db
          .from("treatment_plan_checkin_comments")
          .select("*")
          .eq("checkin_id", checkin.id)
          .order("created_at"),
      ]);
      return {
        checkin,
        media: (media.data ?? []) as any[],
        comments: (comments.data ?? []) as any[],
      };
    },
  });

  return {
    loading: q.isLoading,
    checkin: q.data?.checkin ?? null,
    media: q.data?.media ?? [],
    comments: q.data?.comments ?? [],
    mediaShared: !!client?.media_sharing_consent,
    clientName: client?.client_name ?? "Your client",
    clientUserId: client?.client_user_id ?? null,
    planTitle: client?.plan?.title ?? "Treatment plan",
    proUserId: user?.id ?? null,
  };
}

/** A comment goes to the existing client thread and is linked to the message. */
export function useSendCheckinComment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: { checkinId: string; clientUserId: string; body: string }) => {
      const text = v.body.trim();
      if (!text) throw new Error("Empty comment");

      const { data: threadId, error: threadErr } = await db.rpc("treatment_client_thread", {
        _client_user_id: v.clientUserId,
      });
      if (threadErr) throw threadErr;

      const { data: message, error: msgErr } = await db
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          sender_id: user!.id,
          sender_role: "pro",
          kind: "text",
          body: text,
        })
        .select("id")
        .single();
      if (msgErr) throw msgErr;

      const { error: cErr } = await db.from("treatment_plan_checkin_comments").insert({
        checkin_id: v.checkinId,
        professional_id: user!.id,
        body: text,
        thread_id: threadId,
        chat_message_id: message.id,
      });
      if (cErr) throw cErr;
      return threadId as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pro-checkin-review"] });
      void qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
    },
  });
}
