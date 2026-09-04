import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { challengeSummary, challengesOf } from "@/lib/goalChallenges";
import { buildAiContext } from "@/lib/aiContext";
import type { UserGoal } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStyleToken } from "@/hooks/useCurrentStyleToken";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { TIPS_LEVEL_AI_DIRECTIVE } from "@/lib/tipsLevel";
import { aiRetryDelay, retryTransportOnce } from "@/lib/aiRetry";

import {
  hashString,
  strandTipSignatureParts,
  strandTipStyleColumns,
} from "@/lib/tipSignature";



export interface GoalTipAction {
  action: string;
  why: string;
}

/** The shared tip contract: every guidance surface returns this shape. */
export interface GoalTipStep {
  headline?: string;
  action?: string;
  reason?: string;
  extended?: string;
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
  /** Journal variant only: the steps, on the shared tip contract. */
  steps?: GoalTipStep[];
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
 * Fetches a personalised AI tip for a single goal. Cached against the static
 * signature, so it is generated once and then reused indefinitely until the
 * current style, the planned next style or the goal changes.
 */
const CACHE_VERSION = "v16-tip-contract-2026-08-09";


const cacheKey = (sig: string, goalId?: string, level?: number, variantKey = "n3") =>
  `strand:goal-tip:${CACHE_VERSION}:${sig}:${goalId ?? "none"}:l${level ?? 3}:${variantKey}`;

/** Read the cached tip for this exact signature so a reload paints instantly
 *  instead of waiting ~4s for the AI round-trip. */
/** A tip is only good output when it carries BOTH an action and a reason
 *  (or, for the journal variant, steps that each do). Hollow payloads are
 *  never written to cache and never read back from it. */
const tipHasSubstance = (tip: GoalTip | null | undefined): boolean => {
  if (!tip) return false;
  if (Array.isArray(tip.steps) && tip.steps.length > 0) {
    return tip.steps.every(
      (s) => !!(s.action ?? "").trim() && !!(s.reason ?? "").trim(),
    );
  }
  return (
    !!(tip.action ?? "").trim() &&
    !!((tip.reason ?? "").trim() || (tip.body ?? "").trim())
  );
};

const readCachedTip = (sig: string, goalId?: string, level?: number, variantKey?: string): GoalTip | undefined => {
  if (!goalId || !sig) return undefined;
  try {
    const key = cacheKey(sig, goalId, level, variantKey);
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as GoalTip;
    // READ-TIME GUARD — discard and regenerate rather than render a bare headline.
    if (!tipHasSubstance(parsed)) {
      localStorage.removeItem(key);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
};

/** LAST-GOOD cache, keyed WITHOUT the signature. When the member changes her
 *  current or planned style the signature moves and every exact-signature cache
 *  misses at once, leaving her watching a spinner while a fresh tip is written.
 *  The last good tip for this goal is rendered in the meantime and swapped out
 *  the moment the new one lands. */
//  It is scoped by the CURRENT STYLE token: stale-while-revalidate is right for
//  the same style, but copy written for a style she no longer wears must never
//  render beside freshly generated copy for her new style.
const lastGoodKey = (goalId?: string, level?: number, variantKey = "n3", styleToken = "nostyle") =>
  `strand:goal-tip:last:${styleToken}:${goalId ?? "none"}:l${level ?? 3}:${variantKey}`;

const readLastGoodTip = (goalId?: string, level?: number, variantKey?: string, styleToken?: string): GoalTip | undefined => {
  if (!goalId || !styleToken) return undefined;
  try {
    const raw = localStorage.getItem(lastGoodKey(goalId, level, variantKey, styleToken));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as GoalTip;
    return tipHasSubstance(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const writeLastGoodTip = (goalId: string | undefined, tip: GoalTip | null, level?: number, variantKey?: string, styleToken?: string) => {
  if (!goalId || !tip || !styleToken || !tipHasSubstance(tip)) return;
  try {
    localStorage.setItem(lastGoodKey(goalId, level, variantKey, styleToken), JSON.stringify(tip));
  } catch { /* private mode / quota */ }
};

const writeCachedTip = (sig: string, goalId: string | undefined, tip: GoalTip | null, level?: number, variantKey?: string) => {
  if (!goalId || !tip || !sig) return;
  // WRITE-TIME GUARD — a cache is for good output only.
  if (!tipHasSubstance(tip)) return;
  try {
    localStorage.setItem(cacheKey(sig, goalId, level, variantKey), JSON.stringify(tip));
  } catch { /* private mode / quota */ }
};



export const useGoalTip = (
  goal: UserGoal | null,
  opts?: { maxTips?: number; single?: boolean; variant?: "journal" },
) => {
  // Home's STRAND tip asks for EXACTLY ONE tip (single: true).
  // The Style Journal asks for 2-3 contract steps (variant: "journal").
  // The variant is part of the key so the two surfaces never share a cached
  // answer.
  const journal = opts?.variant === "journal";
  const single = !journal && opts?.single === true;
  const maxTips = single
    ? 1
    : Math.min(5, Math.max(3, Math.round(opts?.maxTips ?? 3)));
  const variantKey = journal ? "journal" : `n${maxTips}`;
  // STATIC. The tip regenerates only when the current style, the planned next
  // style or the goal changes. No calendar rollover, no wash day, no
  // appointment — those belong to the responsive tip surfaces.

  const { level, ready: levelReady } = useTipsLevel();
  const { data: signature } = useTipSignature(goal, level);
  const { token: styleToken } = useCurrentStyleToken();
  return useQuery({
    queryKey: ["goal-tip", CACHE_VERSION, signature, goal?.id, level, variantKey],
    enabled:
      levelReady &&
      !!signature &&
      !!goal &&
      (challengesOf(goal).length > 0 || !!goal.target_text || !!goal.title),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 36,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Transport failures only — a rejected generation is never re-bought.
    retry: retryTransportOnce,
    retryDelay: aiRetryDelay,

    initialData: () => readCachedTip(signature ?? "", goal?.id, level, variantKey),
    // Stale-while-revalidate: show the last good tip for this goal while a new
    // signature (style change, goal edit) is being generated.
    placeholderData: () => readLastGoodTip(goal?.id, level, variantKey, styleToken),
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
      writeLastGoodTip(goal.id, tip, level, variantKey, styleToken);
      return tip;
    },

  });
};

