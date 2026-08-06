import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ComplaintStatus = "received" | "acknowledged" | "resolved" | "rejected";

export type DataProtectionComplaint = {
  id: string;
  user_id: string | null;
  contact_email: string;
  subject: string;
  details: string;
  status: ComplaintStatus;
  submitted_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  admin_notes: string | null;
  resolution_summary: string | null;
};

/** Statutory acknowledgement window under DPA 2018 s.164A. */
export const ACK_WINDOW_DAYS = 30;

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  received: "Received",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  rejected: "Not upheld",
};

export function daysElapsed(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** True when a complaint is past the 30-day window and still unacknowledged. */
export function isOverdue(c: Pick<DataProtectionComplaint, "acknowledged_at" | "submitted_at">) {
  return !c.acknowledged_at && daysElapsed(c.submitted_at) > ACK_WINDOW_DAYS;
}

/** The signed-in member's own complaints. */
export function useMyComplaints() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["data-protection-complaints", "mine", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_protection_complaints")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DataProtectionComplaint[];
    },
  });
}

/**
 * Submits through the edge function so a signed-out visitor can complain too —
 * the table is never opened to anonymous inserts.
 */
export function useSubmitComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contact_email: string; subject: string; details: string }) => {
      const { data, error } = await supabase.functions.invoke(
        "submit-data-protection-complaint",
        { body: input },
      );
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { id: string; submitted_at: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-protection-complaints"] });
    },
  });
}

/** Admin queue — oldest first, so the statutory clock drives the order. */
export function useAdminComplaints(openOnly = true) {
  return useQuery({
    queryKey: ["data-protection-complaints", "admin", openOnly],
    queryFn: async () => {
      let q = supabase
        .from("data_protection_complaints")
        .select("*")
        .order("submitted_at", { ascending: true });
      if (openOnly) q = q.in("status", ["received", "acknowledged"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DataProtectionComplaint[];
    },
  });
}

/** Badge count for the admin nav — complaints still needing work. */
export function useOpenComplaintsCount() {
  return useQuery({
    queryKey: ["data-protection-complaints", "open-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("data_protection_complaints")
        .select("id", { count: "exact", head: true })
        .in("status", ["received", "acknowledged"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useUpdateComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          DataProtectionComplaint,
          "status" | "admin_notes" | "resolution_summary" | "acknowledged_at" | "resolved_at"
        >
      >;
    }) => {
      const { error } = await supabase
        .from("data_protection_complaints")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-protection-complaints"] });
    },
  });
}
