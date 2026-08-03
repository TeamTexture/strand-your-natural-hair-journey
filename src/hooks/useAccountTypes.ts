import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AccountType = "consumer" | "professional" | "brand" | "admin";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  consumer: "Consumer",
  professional: "Professional",
  brand: "Brand",
  admin: "Admin",
};

/** Canonical account type derived from the user_roles table — one source of truth. */
export function deriveAccountType(roles: string[]): AccountType {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("professional")) return "professional";
  if (roles.includes("brand")) return "brand";
  return "consumer";
}

/** Map of user_id → canonical account type for every account with a role row. */
export function useAccountTypes() {
  return useQuery({
    queryKey: ["admin", "account-types"],
    staleTime: 0,
    queryFn: async (): Promise<Map<string, AccountType>> => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const byUser = new Map<string, string[]>();
      (data ?? []).forEach((r) => {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r.role as string);
        byUser.set(r.user_id, list);
      });
      const out = new Map<string, AccountType>();
      byUser.forEach((roles, userId) => out.set(userId, deriveAccountType(roles)));
      return out;
    },
  });
}

export interface RoleHistoryRow {
  id: string;
  from_account_type: string | null;
  to_account_type: string;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export function useRoleHistory(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["admin", "role-history", userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<RoleHistoryRow[]> => {
      const { data, error } = await supabase.rpc("admin_role_history", { _user_id: userId! });
      if (error) throw error;
      return (data ?? []) as RoleHistoryRow[];
    },
  });
}

/** Admin-only atomic account type conversion. */
export function useSetAccountType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, accountType }: { userId: string; accountType: Exclude<AccountType, "admin"> }) => {
      const { error } = await supabase.rpc("admin_set_account_type", {
        _user_id: userId,
        _account_type: accountType,
      });
      if (error) throw error;
      return accountType;
    },
    onSuccess: (accountType) => {
      // Everything derives from roles — refresh every surface that reads them.
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success(`Account type changed to ${ACCOUNT_TYPE_LABEL[accountType]}.`);
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not change account type");
    },
  });
}
