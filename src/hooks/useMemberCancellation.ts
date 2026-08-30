import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useRoles";
import { useViewAs } from "@/hooks/useViewAs";

export interface CancellationRow {
  user_id: string;
  cancellation_reason: string | null;
  cancellation_comment: string | null;
  cancellation_source: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  recorded_at: string;
}

/**
 * Latest recorded cancellation per member. ADMIN-ONLY: the table's single RLS
 * policy is `has_role(auth.uid(), 'admin')`, so a member or professional gets
 * zero rows at the API level. Disabled entirely in Shadow View so the reason
 * can never appear on a member-facing render.
 */
export function useMemberCancellations(enabled = true) {
  const { isAdmin, loading } = useRoles();
  const { isViewingAs } = useViewAs();
  return useQuery({
    queryKey: ["admin-subscription-cancellations"],
    enabled: enabled && isAdmin && !loading && !isViewingAs,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_cancellations")
        .select(
          "user_id, cancellation_reason, cancellation_comment, cancellation_source, canceled_at, cancel_at_period_end, recorded_at",
        )
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, CancellationRow>();
      for (const row of (data ?? []) as CancellationRow[]) {
        if (!latest.has(row.user_id)) latest.set(row.user_id, row);
      }
      return latest;
    },
  });
}

const REASON_LABELS: Record<string, string> = {
  customer_service: "Poor customer service",
  low_quality: "Quality was not good enough",
  missing_features: "Missing features they needed",
  other: "Other",
  switched_service: "Switched to another service",
  too_complex: "Too complicated to use",
  too_expensive: "Too expensive",
  unused: "Not using it enough",
};

export function cancellationReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return (
    REASON_LABELS[reason] ??
    reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
