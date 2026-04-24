import { useEffect, useState, useCallback } from "react";
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
}

export type GoalDraft = Partial<Omit<UserGoal, "id" | "user_id">>;

export const useGoals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (showSpinner = false) => {
    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    const { data } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setGoals((data ?? []) as unknown as UserGoal[]);
    setLoading(false);
  }, [user]);

  // Initial load shows spinner; later refreshes are silent so the UI doesn't
  // flash while we re-fetch after a save.
  const initialLoad = useCallback(() => refresh(true), [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertGoal = useCallback(
    async (draft: GoalDraft, id?: string) => {
      if (!user) return null;
      // The DB still has NOT NULL on title; provide a sensible default when blank.
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
        await refresh();
        return data;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = { ...safeDraft, user_id: user.id };
      const { data } = await supabase
        .from("user_goals")
        .insert(insertPayload)
        .select()
        .single();
      await refresh();
      return data;
    },
    [user, refresh],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      if (!user) return;
      await supabase.from("user_goals").delete().eq("id", id).eq("user_id", user.id);
      await refresh();
    },
    [user, refresh],
  );

  // Convenience: the primary length retention goal (first match by kind).
  const lengthGoal = goals.find((g) => g.kind === "length_retention") ?? null;

  return { goals, lengthGoal, loading, upsertGoal, deleteGoal, refresh };
};
