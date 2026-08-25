import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Supplement {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  source: string;
  source_url: string | null;
  image_url: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface SupplementDraft {
  name: string;
  dose?: string | null;
  frequency?: string | null;
  source?: "photo" | "link" | "manual";
  source_url?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
}

export const supplementsKey = (userId?: string) => ["user-supplements", userId ?? "anon"] as const;

export const useSupplements = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    // Scoped by member id — an unscoped key would serve one account's
    // supplements from cache to the next account in the same tab.
    queryKey: supplementsKey(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<Supplement[]> => {
      const { data, error } = await supabase
        .from("user_supplements")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        dose: (row.dose as string | null) ?? null,
        frequency: (row.frequency as string | null) ?? null,
        source: (row.source as string | null) ?? "manual",
        source_url: (row.source_url as string | null) ?? null,
        image_url: (row.image_url as string | null) ?? null,
        storage_path: (row.storage_path as string | null) ?? null,
        created_at: row.created_at as string,
      }));
    },
  });

  const add = useMutation({
    mutationFn: async (draft: SupplementDraft) => {
      const { data: userData } = await getDisplayedAuthUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_supplements").insert({
        user_id: userData.user.id,
        name: draft.name.trim().slice(0, 80),
        dose: draft.dose ?? null,
        frequency: draft.frequency ?? null,
        source: draft.source ?? "manual",
        source_url: draft.source_url ?? null,
        image_url: draft.image_url ?? null,
        storage_path: draft.storage_path ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supplementsKey(user?.id) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await getDisplayedAuthUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_supplements")
        .delete()
        .eq("id", id)
        .eq("user_id", userData.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supplementsKey(user?.id) }),
  });

  return { ...query, supplements: query.data ?? [], add, remove };
};
