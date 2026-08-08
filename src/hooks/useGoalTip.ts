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
  strandTipSignatureParts,
  strandTipStyleColumns,
} from "@/lib/tipSignature";



export interface GoalTipAction {
  action: string;
  why: string;
}

export interface GoalTip {
  headline?: string;
  /** Single-tip (Home) mode: the instruction. Required — never rendered empty. */
  action?: string;
  /** Single-tip (Home) mode: why it matters for this member. Required. */
  reason?: string;
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
 * STATIC signature for the home STRAND tip.
 *
 * Three data points only: `current_hairstyle`, `planned_next_style` and the
 * member's goal (id + wording + target). There is deliberately NO calendar day
 * and no responsive input — logging a wash day, booking an appointment, editing
 * challenges/concerns or adding blood results must NOT regenerate this tip.
 * Once generated, the same tip persists indefinitely until one of the three
 * changes. The support level is a rendering variant, not a data trigger, so it
 * keys the cache without ever forcing a fresh generation at the same level.
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
      level,
    ],
    enabled: !!user?.id && !!goal,
    // The three inputs are read once and then held — nothing about this tip is
    // time-based, so there is no reason to keep re-reading the profile.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    queryFn: async (): Promise<string> => {
      if (!user?.id) return "anon";
      const styleRes = await supabase
        .from("user_style_profile")
        .select(strandTipStyleColumns)
        .eq("user_id", user.id)
        .maybeSingle();
      return hashString(
        [
          "goal-tip-sig-v4-static",
          ...strandTipSignatureParts(
            (styleRes.data as Record<string, unknown> | null) ?? null,
            goal,
          ),
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
const CACHE_VERSION = "v13-action-reason-floor";

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
  // No day is sent — the tip must not rotate on a calendar rollover.
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

  });
};

