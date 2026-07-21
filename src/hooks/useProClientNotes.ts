import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProClientNote {
  id: string;
  pro_user_id: string;
  consumer_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

/**
 * Private client notes for a professional. RLS scopes reads to the pro's own
 * rows only — the consumer never sees these, and admins are deliberately
 * excluded. Notes survive consent revocation as the pro's own work product.
 */
export const useProClientNotes = (consumerId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro-client-notes", user?.id, consumerId],
    enabled: !!user && !!consumerId,
    staleTime: 15_000,
    queryFn: async (): Promise<ProClientNote[]> => {
      const { data, error } = await supabase
        .from("pro_client_notes")
        .select("id,pro_user_id,consumer_id,note,created_at,updated_at")
        .eq("pro_user_id", user!.id)
        .eq("consumer_id", consumerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProClientNote[];
    },
  });
};

export const useAddProClientNote = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consumerId, note }: { consumerId: string; note: string }) => {
      const clean = note.trim();
      if (!clean) throw new Error("Note is empty");
      const { data, error } = await supabase
        .from("pro_client_notes")
        .insert({ pro_user_id: user!.id, consumer_id: consumerId, note: clean })
        .select()
        .single();
      if (error) throw error;
      return data as ProClientNote;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pro-client-notes", user?.id, v.consumerId] });
      qc.invalidateQueries({ queryKey: ["pro-clients", user?.id] });
    },
  });
};

export const useUpdateProClientNote = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note, consumerId: _c }: { id: string; note: string; consumerId: string }) => {
      const clean = note.trim();
      if (!clean) throw new Error("Note is empty");
      const { error } = await supabase
        .from("pro_client_notes")
        .update({ note: clean })
        .eq("id", id)
        .eq("pro_user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pro-client-notes", user?.id, v.consumerId] });
    },
  });
};

export const useDeleteProClientNote = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, consumerId: _c }: { id: string; consumerId: string }) => {
      const { error } = await supabase
        .from("pro_client_notes")
        .delete()
        .eq("id", id)
        .eq("pro_user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pro-client-notes", user?.id, v.consumerId] });
      qc.invalidateQueries({ queryKey: ["pro-clients", user?.id] });
    },
  });
};
