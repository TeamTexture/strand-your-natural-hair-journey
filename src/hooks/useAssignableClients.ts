import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Clients (or, for admins, members) who can be assigned a treatment plan.
 *
 * Treatment plans are a STRAND+ feature for every client with no exceptions, so
 * this list contains only STRAND+ holders. The same rule is enforced inside
 * public.assign_treatment_template — filtering here is convenience, not the gate.
 */
export interface AssignableClient {
  user_id: string;
  name: string;
  email: string | null;
}

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export function useAssignableClients(enabled = true) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-assignable-clients", user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AssignableClient[]> => {
      const { data, error } = await db.rpc("treatment_assignable_clients");
      if (error) throw error;
      return ((data ?? []) as AssignableClient[]).map((c) => ({
        ...c,
        name: c.name || c.email || "Member",
      }));
    },
  });
  return { clients: q.data ?? [], loading: q.isLoading };
}

/** One wording, used on both the professional and admin assign screens. */
export const PLUS_ASSIGN_NOTE =
  "Treatment plans are a STRAND+ feature. Only clients with STRAND+ can be assigned one.";

export const PLUS_ASSIGN_EMPTY =
  "None of your clients have STRAND+ yet, so there's no one to assign a plan to. They'll appear here as soon as they upgrade.";
