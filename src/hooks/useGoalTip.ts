import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import type { UserGoal } from "@/hooks/useGoals";

export interface GoalTipAction {
  action: string;
  why: string;
}

export interface GoalTip {
  headline: string;
  body: string;
  actions: Array<GoalTipAction | string>;
}

/**
 * Fetches a personalised AI tip for a single goal. Cached per goal id +
 * updated_at so editing the goal triggers a refresh, but normal page
 * navigation reuses the cached tip instantly.
 */
const cacheKey = (day: string, goalId?: string) => `strand:goal-tip:${day}:${goalId ?? "none"}`;

/** Read today's cached tip so a page reload paints instantly instead of
 *  waiting ~4s for the AI round-trip. */
const readCachedTip = (day: string, goalId?: string): GoalTip | undefined => {
  if (!goalId) return undefined;
  try {
    const raw = localStorage.getItem(cacheKey(day, goalId));
    return raw ? (JSON.parse(raw) as GoalTip) : undefined;
  } catch {
    return undefined;
  }
};

const writeCachedTip = (day: string, goalId: string | undefined, tip: GoalTip | null) => {
  if (!goalId || !tip) return;
  try {
    localStorage.setItem(cacheKey(day, goalId), JSON.stringify(tip));
  } catch { /* private mode / quota */ }
};

export const useGoalTip = (goal: UserGoal | null) => {
  // Daily rotation — key rolls over at local midnight so the AI re-analyses
  // once per day using whatever the user has since logged (products, wash
  // days, appointments, blood work, hair/health profile changes).
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["goal-tip", "manuscript-v6-style-playbook-daily", today, goal?.id],
    enabled: !!goal && !!(goal.challenge || goal.target_text || goal.title),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 36,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    initialData: () => readCachedTip(today, goal?.id),
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
      const tip = (data?.tip as GoalTip) ?? null;
      writeCachedTip(today, goal.id, tip);
      return tip;
    },
  });
};
