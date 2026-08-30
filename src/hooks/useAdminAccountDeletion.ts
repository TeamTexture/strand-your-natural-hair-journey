import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertNotViewingAs } from "@/lib/viewAsReadOnly";

/**
 * Admin-side view of another member's account deletion: the pending state (if
 * any), the admin audit trail, and the action that starts the same 30-day
 * grace period a member starts for herself.
 *
 * Nothing here erases anything — erasure happens 30 days later.
 */
export interface AdminDeletionHistoryRow {
  id: string;
  action: string;
  performed_by_name: string | null;
  erase_on: string | null;
  reason: string | null;
  created_at: string;
}

export function useMemberDeletionState(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "member-deletion", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ deletion_requested_at: string | null }> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("deletion_requested_at")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return { deletion_requested_at: data?.deletion_requested_at ?? null };
    },
  });
}

export function useAdminDeletionHistory(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["admin", "member-deletion-history", userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<AdminDeletionHistoryRow[]> => {
      const { data, error } = await supabase.rpc("admin_account_deletion_history", {
        _user_id: userId!,
      });
      if (error) throw error;
      return (data ?? []) as AdminDeletionHistoryRow[];
    },
  });
}

/** Admin requests deletion of ANOTHER account. Starts the 30-day clock. */
export function useAdminRequestAccountDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      assertNotViewingAs("Account deletion");
      const { data, error } = await supabase.functions.invoke("admin-account-deletion", {
        body: { userId },
      });
      if (error) throw new Error(error.message);
      const payload = data as { error?: string; erase_on?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      return payload as { erase_on: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "member-deletion", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "member-deletion-history", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
