import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Fetches the current user's role set. Cached — role changes are rare. */
export function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role);
    },
  });
  const roles = q.data ?? [];
  return {
    roles,
    isConsumer: roles.includes("consumer"),
    isProfessional: roles.includes("professional"),
    isAdmin: roles.includes("admin"),
    isBrand: roles.includes("brand"),
    loading: authLoading || q.isLoading,
  };
}
