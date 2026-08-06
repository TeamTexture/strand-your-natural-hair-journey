import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { challengeSummary, challengesOf } from "@/lib/goalChallenges";
import { buildAiContext } from "@/lib/aiContext";
import type { UserGoal } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { TIPS_LEVEL_AI_DIRECTIVE } from "@/lib/tipsLevel";
import {
  hashString,
  loadResponsiveSignals,
  responsiveSignatureParts,
  styleSignatureParts,
} from "@/lib/tipSignature";


export interface GoalTipAction {
  action: string;
  why: string;
}

export interface GoalTip {
  headline?: string;
  body?: string;
  /** Single-tip (Home) mode only: one optional frequency/duration/tool chip. */
  key_fact?: string;
  /** Journal variant only: the one overview block. */
  overview?: string;
  /** Journal variant only: the one caution block. */
  caution?: string;
  /** Journal variant only: the profile signals the reasoning rests on. */
  signals?: string[];
  actions?: Array<GoalTipAction | string>;
}


/**
 * Live personalisation signature — the Strand Tip of the Day must move the
 * moment the reasoning behind it moves. It folds in the calendar day, the
 * goal (id + wording + target), every challenge, current + planned style
 * (with extensions/tension), areas of concern and the latest wash day /
 * appointment. Any change here produces a new cache key, so the tip is
 * regenerated against the new picture instead of waiting for midnight.
 */
const useTipSignature = (goal: UserGoal | null, level: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "goal-tip-signature",
      user?.id,
      goal?.id,
      goal?.target_text,
      goal?.target_date,
      goal?.title,
      goal?.updated_at,
      level,
    ],
    enabled: !!user?.id && !!goal,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
    queryFn: async (): Promise<string> => {
      if (!user?.id) return "anon";
      const [signals, styleRes] = await Promise.all([
        loadResponsiveSignals(user.id),
        supabase
          .from("user_style_profile")
          .select(
            "current_hairstyle, planned_next_style, current_style_extensions, current_style_tension, planned_style_extensions, planned_style_tension",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      return hashString(
        [
          "goal-tip-sig-v1",
          `goal:${goal?.id ?? ""}`,
          `target:${goal?.target_text ?? ""}`,
          `date:${goal?.target_date ?? ""}`,
          `title:${goal?.title ?? ""}`,
          `goalChallenges:${challengesOf(goal as UserGoal).sort().join("|")}`,
          ...styleSignatureParts(
            (styleRes.data as Record<string, unknown> | null) ?? null,
          ),
          ...responsiveSignatureParts(signals),
          `tl${level}`,
        ].join("::"),
      );
    },
  });
};

/**
 * Fetches a personalised AI tip for a single goal. Cached per goal +
 * personalisation signature so a style, goal or challenge edit refreshes the
 * tip immediately, while normal page navigation reuses the cached tip.
 */
const CACHE_VERSION = "v9-live-signature";

const cacheKey = (sig: string, goalId?: string, level?: number, variantKey = "n3") =>
  `strand:goal-tip:${CACHE_VERSION}:${sig}:${goalId ?? "none"}:l${level ?? 3}:${variantKey}`;

/** Read the cached tip for this exact signature so a reload paints instantly
 *  instead of waiting ~4s for the AI round-trip. */
const readCachedTip = (sig: string, goalId?: string, level?: number, variantKey?: string): GoalTip | undefined => {
  if (!goalId || !sig) return undefined;
  try {
    const raw = localStorage.getItem(cacheKey(sig, goalId, level, variantKey));
    return raw ? (JSON.parse(raw) as GoalTip) : undefined;
  } catch {
    return undefined;
  }
};

const writeCachedTip = (sig: string, goalId: string | undefined, tip: GoalTip | null, level?: number, variantKey?: string) => {
  if (!goalId || !tip || !sig) return;
  try {
    localStorage.setItem(cacheKey(sig, goalId, level, variantKey), JSON.stringify(tip));
  } catch { /* private mode / quota */ }
};


export const useGoalTip = (
  goal: UserGoal | null,
  opts?: { maxTips?: number; single?: boolean; variant?: "journal" },
) => {
  // Home's Strand Tip of the Day asks for EXACTLY ONE tip (single: true).
  // The Style Journal asks for ONE overview + ONE caution (variant: "journal").
  // The variant is part of the key so the two surfaces never share a cached
  // answer.
  const journal = opts?.variant === "journal";
  const single = !journal && opts?.single === true;
  const maxTips = single
    ? 1
    : Math.min(5, Math.max(3, Math.round(opts?.maxTips ?? 3)));
  const variantKey = journal ? "journal" : `n${maxTips}`;
  // The tip rolls over daily AND regenerates the moment the personalisation
  // signature moves (style, goal wording, challenges, concerns, latest wash
  // day/appointment, support level) — whichever happens first.
  const today = new Date().toISOString().slice(0, 10);
  const { level } = useTipsLevel();
  const { data: signature } = useTipSignature(goal, level);
  return useQuery({
    queryKey: ["goal-tip", CACHE_VERSION, signature, goal?.id, level, variantKey],
    enabled:
      !!signature &&
      !!goal &&
      (challengesOf(goal).length > 0 || !!goal.target_text || !!goal.title),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 36,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    initialData: () => readCachedTip(signature ?? "", goal?.id, level, variantKey),
    queryFn: async (): Promise<GoalTip | null> => {
      if (!goal) return null;
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("goal-tip", {
        body: {
          single,
          ...(journal ? { variant: "journal" as const } : {}),
          day: today,
          // The signature IS the fingerprint — the edge function seeds its
          // pillar rotation from it, so new data means a new angle.
          profileFingerprint: signature ?? "",
          goal: {
            // goal-tip reads challenges via the shared accessor; send both
            // the list and a joined line so older prompt paths still resolve.
            challenges: challengesOf(goal),
            challenge: challengeSummary(goal) || goal.title || null,
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
      writeCachedTip(signature ?? "", goal.id, tip, level, variantKey);
      return tip;
    },

      return tip;
    },
  });
};

