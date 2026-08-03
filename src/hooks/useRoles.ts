import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role);
}

function shape(roles: AppRole[], loading: boolean) {
  return {
    roles,
    isConsumer: roles.includes("consumer"),
    isProfessional: roles.includes("professional"),
    isAdmin: roles.includes("admin"),
    isBrand: roles.includes("brand"),
    loading,
  };
}

/**
 * Roles for the EFFECTIVE identity the app is rendering.
 *
 * Normally that's the signed-in user. In admin Shadow View ("view as user")
 * it is the impersonated user's roles, read live from public.user_roles for
 * their user_id — so dashboards, nav items and role toggles show exactly what
 * that person sees when they log in, never the admin's own privileges.
 */
export function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchRoles(user!.id),
  });
  return shape(q.data ?? [], authLoading || q.isLoading);
}

/**
 * Roles of the REAL signed-in account, ignoring Shadow View. Only for surfaces
 * that must reflect the actual operator (e.g. the shadow-view banner/exit).
 */
export function useActualRoles() {
  const { actualUser, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["user-roles", "actual", actualUser?.id],
    enabled: !!actualUser,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchRoles(actualUser!.id),
  });
  return shape(q.data ?? [], authLoading || q.isLoading);
}
