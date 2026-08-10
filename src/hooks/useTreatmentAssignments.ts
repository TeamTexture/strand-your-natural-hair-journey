import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TreatmentCadence, TreatmentTimeOfDay } from "@/lib/treatmentSchedule";

/**
 * Plan invitations and the media sharing decision.
 *
 * Two decisions live here and they are deliberately separate: accepting a plan
 * (`accept_treatment_assignment`) and sharing media
 * (`set_treatment_media_consent`). Accepting never grants media access, and
 * turning sharing off only revokes access — nothing recorded is ever deleted.
 */

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type AssignmentStatus = "pending" | "accepted" | "declined" | "revoked";

export interface AssignmentRow {
  id: string;
  plan_id: string | null;
  template_id: string | null;
  status: AssignmentStatus;
  professional_id: string | null;
  assigner_user_id: string | null;
  assigner_type: "professional" | "admin";
  media_sharing_consent: boolean;
  media_consent_revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface InvitationStep {
  id: string;
  task_name: string;
  instructions: string | null;
  cadence: TreatmentCadence;
  days_of_week: number[] | null;
  time_of_day: TreatmentTimeOfDay;
  step_order: number;
}

export interface InvitationDetail {
  assignment_id: string;
  status: AssignmentStatus;
  media_sharing_consent: boolean;
  plan_id: string | null;
  assigner_type: "professional" | "admin";
  sender_name: string;
  sender_title: string | null;
  template: {
    id: string;
    title: string;
    description: string | null;
    duration_weeks: number;
    milestone_weeks: number[] | null;
  } | null;
  steps: InvitationStep[];
  product_count: number;
}

/** Pending invitations for the signed-in member, email invites claimed first. */
export function usePlanInvitations() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-invitations", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<AssignmentRow[]> => {
      // Invites addressed to an email address resolve on first sign-in.
      await db.rpc("claim_my_treatment_invites");
      const { data, error } = await db
        .from("treatment_plan_assignments")
        .select(
          "id, plan_id, template_id, status, professional_id, assigner_user_id, assigner_type, media_sharing_consent, media_consent_revoked_at, accepted_at, created_at",
        )
        .eq("client_user_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });
  return { invitations: q.data ?? [], loading: q.isLoading };
}

/** The assignment behind a plan, for the member's own media sharing switch. */
export function usePlanAssignment(planId?: string) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-assignment", user?.id, planId],
    enabled: !!user?.id && !!planId,
    staleTime: 30_000,
    queryFn: async (): Promise<AssignmentRow | null> => {
      const { data, error } = await db
        .from("treatment_plan_assignments")
        .select(
          "id, plan_id, template_id, status, professional_id, assigner_user_id, assigner_type, media_sharing_consent, media_consent_revoked_at, accepted_at, created_at",
        )
        .eq("plan_id", planId)
        .eq("client_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AssignmentRow | null;
    },
  });
  return { assignment: q.data ?? null, loading: q.isLoading };
}

/** Who sent it, what it involves — readable in full before any decision. */
export function useInvitationDetail(assignmentId?: string) {
  const q = useQuery({
    queryKey: ["treatment-invitation", assignmentId],
    enabled: !!assignmentId,
    staleTime: 15_000,
    queryFn: async (): Promise<InvitationDetail> => {
      const { data, error } = await db.rpc("treatment_invitation", {
        _assignment_id: assignmentId,
      });
      if (error) throw error;
      return data as InvitationDetail;
    },
  });
  return { invitation: q.data ?? null, loading: q.isLoading, error: q.error };
}

export function useInvitationActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["treatment-invitations", user?.id] });
    void qc.invalidateQueries({ queryKey: ["treatment-invitation"] });
    void qc.invalidateQueries({ queryKey: ["treatment-assignment", user?.id] });
    void qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] });
  };

  const accept = useMutation({
    mutationFn: async (assignmentId: string): Promise<string> => {
      const { data, error } = await db.rpc("accept_treatment_assignment", {
        _assignment_id: assignmentId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const decline = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await db.rpc("decline_treatment_assignment", {
        _assignment_id: assignmentId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Reversible at any time. Turning it off keeps every recording. */
  const setMediaConsent = useMutation({
    mutationFn: async (v: { assignmentId: string; on: boolean }) => {
      const { error } = await db.rpc("set_treatment_media_consent", {
        _assignment_id: v.assignmentId,
        _on: v.on,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { accept, decline, setMediaConsent };
}
