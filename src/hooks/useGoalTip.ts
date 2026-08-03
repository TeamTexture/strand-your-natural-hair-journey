import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import type { UserGoal } from "@/hooks/useGoals";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { TIPS_LEVEL_AI_DIRECTIVE } from "@/lib/tipsLevel";

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
const cacheKey = (day: string, goalId?: string, level?: number, maxTips = 3) =>
  `strand:goal-tip:${day}:${goalId ?? "none"}:l${level ?? 3}:n${maxTips}`;

/** Read today's cached tip so a page reload paints instantly instead of
 *  waiting ~4s for the AI round-trip. */
const readCachedTip = (day: string, goalId?: string, level?: number, maxTips = 3): GoalTip | undefined => {
  if (!goalId) return undefined;
  try {
    const raw = localStorage.getItem(cacheKey(day, goalId, level, maxTips));
    return raw ? (JSON.parse(raw) as GoalTip) : undefined;
  } catch {
    return undefined;
  }
};

const writeCachedTip = (day: string, goalId: string | undefined, tip: GoalTip | null, level?: number, maxTips = 3) => {
  if (!goalId || !tip) return;
  try {
    localStorage.setItem(cacheKey(day, goalId, level, maxTips), JSON.stringify(tip));
  } catch { /* private mode / quota */ }
};

export const useGoalTip = (goal: UserGoal | null, opts?: { maxTips?: number }) => {
  // The Style Journal asks for a deeper set (up to 5) at levels 3–4; Home
  // stays at 3. The count is part of the key so the two surfaces never
  // share a cached answer.
  const maxTips = Math.min(5, Math.max(3, Math.round(opts?.maxTips ?? 3)));
  // Daily rotation — key rolls over at local midnight so the AI re-analyses
  // once per day using whatever the user has since logged (products, wash
  // days, appointments, blood work, hair/health profile changes). Support
  // level is part of the key/cache so regenerating the tip after switching
  // levels produces copy at the right density instead of reusing yesterday's.
  const today = new Date().toISOString().slice(0, 10);
  const { level } = useTipsLevel();
  return useQuery({
    queryKey: ["goal-tip", "manuscript-v6-style-playbook-daily", today, goal?.id, level, maxTips],
    enabled: !!goal && !!(goal.challenge || goal.target_text || goal.title),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 36,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    initialData: () => readCachedTip(today, goal?.id, level, maxTips),
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
          tipsLevelDirective: TIPS_LEVEL_AI_DIRECTIVE[level],
          maxTips,
        },
      });
      if (error) throw error;
      const tip = (data?.tip as GoalTip) ?? null;
      writeCachedTip(today, goal.id, tip, level, maxTips);
      return tip;
    },
  });
};
