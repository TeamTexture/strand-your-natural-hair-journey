import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import type { UserGoal } from "@/hooks/useGoals";

export interface GoalTip {
  headline: string;
  body: string;
  actions: string[];
}

/**
 * Fetches a personalised AI tip for a single goal. Cached per goal id +
 * updated_at so editing the goal triggers a refresh, but normal page
 * navigation reuses the cached tip instantly.
 */
export const useGoalTip = (goal: UserGoal | null) => {
  return useQuery({
    queryKey: ["goal-tip", "manuscript-v1", goal?.id, goal?.updated_at],
    enabled: !!goal && !!(goal.challenge || goal.target_text || goal.title),
    staleTime: 1000 * 60 * 60 * 6,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    queryFn: async (): Promise<GoalTip | null> => {
      if (!goal) return null;
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("goal-tip", {
        body: {
          goal: {
            challenge: goal.challenge ?? goal.title ?? null,
            target_text: goal.target_text ?? null,
            target_date: goal.target_date ?? null,
            status: goal.status ?? null,
          },
          context,
        },
      });
      if (error) throw error;
      return (data?.tip as GoalTip) ?? null;
    },
  });
};
