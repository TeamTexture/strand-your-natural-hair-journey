import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserGoal {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  unit: string;
  target_value: number | null;
  current_value: number;
  start_value: number;
  target_date: string | null;
  status: string;
  notes: string | null;
  challenge: string | null;
  target_text: string | null;
  challenge_voice_url: string | null;
  target_voice_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export type GoalDraft = Partial<Omit<UserGoal, "id" | "user_id">>;

/**
 * Single shared React Query cache for goals so every consumer (Home,
 * Journal, editor sheet) sees the same list and updates instantly when
 * any one of them saves. Previously each hook instance held its own
 * useState, which meant the editor's optimistic insert never reached
 * Home/Journal until they remounted.
 */
export const useGoals = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["user_goals", user?.id ?? "anon"];

  const { data: goals = [], isLoading: loading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as UserGoal[];
      const { data } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as UserGoal[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ draft, id }: { draft: GoalDraft; id?: string }) => {
      if (!user) return null;
      const safeDraft = {
        ...draft,
        title: draft.title?.trim() || draft.challenge?.slice(0, 60) || "Hair goal",
      };
      if (id) {
        const { data } = await supabase
          .from("user_goals")
          .update(safeDraft)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();
        return data as unknown as UserGoal | null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = { ...safeDraft, user_id: user.id };
      const { data } = await supabase
        .from("user_goals")
        .insert(insertPayload)
        .select()
        .single();
      return data as unknown as UserGoal | null;
    },
    onSuccess: (saved, vars) => {
      if (!saved) return;
      // Optimistic merge into the shared cache so all consumers update
      // immediately — no remount or refetch needed.
      qc.setQueryData<UserGoal[]>(queryKey, (prev = []) => {
        if (vars.id) {
          return prev.map((g) => (g.id === vars.id ? { ...g, ...saved } : g));
        }
        return [saved, ...prev];
      });
      // Background refetch keeps server-side timestamps in sync.
      void qc.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      await supabase.from("user_goals").delete().eq("id", id).eq("user_id", user.id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<UserGoal[]>(queryKey) ?? [];
      qc.setQueryData<UserGoal[]>(queryKey, prev.filter((g) => g.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const upsertGoal = useCallback(
    (draft: GoalDraft, id?: string) => upsertMutation.mutateAsync({ draft, id }),
    [upsertMutation],
  );
  const deleteGoal = useCallback((id: string) => deleteMutation.mutateAsync(id), [deleteMutation]);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  // Prefer an explicit length-retention goal, but fall back to the most
  // recent goal so anything the user saves in the Style Journal editor
  // (which currently writes kind="challenge") still surfaces on Home.
  const lengthGoal =
    goals.find((g) => g.kind === "length_retention") ?? goals[0] ?? null;

  return { goals, lengthGoal, loading, upsertGoal, deleteGoal, refresh };
};
