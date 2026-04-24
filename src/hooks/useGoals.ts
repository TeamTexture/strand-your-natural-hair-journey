import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserGoal {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  unit: string;
  target_value: number;
  current_value: number;
  start_value: number;
  target_date: string | null;
  status: string;
  notes: string | null;
}

export type GoalDraft = Omit<UserGoal, "id" | "user_id">;

export const useGoals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setGoals((data ?? []) as UserGoal[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertGoal = useCallback(
    async (draft: GoalDraft, id?: string) => {
      if (!user) return null;
      if (id) {
        const { data } = await supabase
          .from("user_goals")
          .update(draft)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();
        await refresh();
        return data;
      }
      const { data } = await supabase
        .from("user_goals")
        .insert({ ...draft, user_id: user.id })
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
