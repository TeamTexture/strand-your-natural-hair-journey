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
  /** Single-tip (Home) mode only: one optional frequency/duration/tool chip. */
  key_fact?: string;
  actions: Array<GoalTipAction | string>;
}

/**
 * Stable fingerprint of the hair characteristics + goal that the tip reasons
 * from. Combined with the calling day it keeps the Strand Tip of the Day fixed
 * for the whole day and rotates it tomorrow, while a profile or goal edit
 * regenerates immediately.
 */
const profileFingerprint = (
  context: Record<string, unknown>,
  goalId?: string,
): string => {
  const hair = (context.hair ?? {}) as Record<string, unknown>;
  const style = (context.currentStyle ?? {}) as Record<string, unknown>;
  const parts = [
    goalId ?? "",
    JSON.stringify(hair),
    String(style.current_hairstyle ?? ""),
    String(style.planned_next_style ?? ""),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

/**
 * Fetches a personalised AI tip for a single goal. Cached per goal id +
 * updated_at so editing the goal triggers a refresh, but normal page
 * navigation reuses the cached tip instantly.
 */
const CACHE_VERSION = "v7-single-tip";

const cacheKey = (day: string, goalId?: string, level?: number, maxTips = 3) =>
  `strand:goal-tip:${CACHE_VERSION}:${day}:${goalId ?? "none"}:l${level ?? 3}:n${maxTips}`;

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

export const useGoalTip = (
  goal: UserGoal | null,
  opts?: { maxTips?: number; single?: boolean },
) => {
  // Home's Strand Tip of the Day asks for EXACTLY ONE tip (single: true).
  // The Style Journal keeps the fuller playbook (up to 5) at levels 3–4.
  // The count is part of the key so the two surfaces never share a cached
  // answer.
  const single = opts?.single === true;
  const maxTips = single
    ? 1
    : Math.min(5, Math.max(3, Math.round(opts?.maxTips ?? 3)));
  // Daily rotation — key rolls over at local midnight so the AI re-analyses
  // once per day using whatever the user has since logged (products, wash
  // days, appointments, blood work, hair/health profile changes). Support
  // level is part of the key/cache so regenerating the tip after switching
  // levels produces copy at the right density instead of reusing yesterday's.
  const today = new Date().toISOString().slice(0, 10);
  const { level } = useTipsLevel();
  return useQuery({
    queryKey: ["goal-tip", CACHE_VERSION, today, goal?.id, level, maxTips],
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
          single,
          day: today,
          profileFingerprint: profileFingerprint(
            context as unknown as Record<string, unknown>,
            goal.id,
          ),
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
