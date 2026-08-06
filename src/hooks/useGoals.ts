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
  /** @deprecated superseded by `challenges`. Retained for rollback only. */
  challenge: string | null;
  /** What the member is struggling with. No minimum, no maximum. */
  challenges: string[];
  target_text: string | null;
  challenge_voice_url: string | null;
  target_voice_url: string | null;
  started_at?: string | null;
  ended_at?: string | null;
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
        title:
          draft.title?.trim() ||
          draft.challenges?.[0]?.slice(0, 60) ||
          "Hair goal",
      };
      if (id) {
        const { data, error } = await supabase
          .from("user_goals")
          .update(safeDraft)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .maybeSingle();
        if (error) throw error;
        return data as unknown as UserGoal | null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = { ...safeDraft, user_id: user.id };
      const { data, error } = await supabase
        .from("user_goals")
        .insert(insertPayload)
        .select()
        .maybeSingle();
      if (error) throw error;
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
  const activeGoals = goals.filter(
    (g) => (g.status ?? "in_progress") === "in_progress" && !g.ended_at,
  );
  const pastGoals = goals
    .filter((g) => g.status === "past" || !!g.ended_at)
    .sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""));

  const lengthGoal =
    activeGoals.find((g) => g.kind === "length_retention") ??
    activeGoals[0] ??
    goals.find((g) => g.kind === "length_retention") ??
    goals.find((g) => !g.ended_at) ??
    null;

  /** End a goal without deleting it — history is never wiped. */
  const endGoal = useCallback(
    (id: string) =>
      upsertMutation.mutateAsync({
        id,
        draft: { status: "past", ended_at: new Date().toISOString() },
      }),
    [upsertMutation],
  );

  /**
   * "Set new goal" — closes every currently active goal (status past,
   * ended_at now) and creates the new one. Nothing is overwritten.
   */
  const startNewGoal = useCallback(
    async (draft: GoalDraft) => {
      const endedAt = new Date().toISOString();
      for (const g of activeGoals) {
        await upsertMutation.mutateAsync({
          id: g.id,
          draft: { status: "past", ended_at: endedAt },
        });
      }
      return upsertMutation.mutateAsync({
        draft: { ...draft, status: "in_progress", ended_at: null, started_at: endedAt },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upsertMutation, activeGoals.map((g) => g.id).join(",")],
  );

  return {
    goals,
    activeGoals,
    pastGoals,
    lengthGoal,
    loading,
    upsertGoal,
    deleteGoal,
    endGoal,
    startNewGoal,
    refresh,
  };
};
