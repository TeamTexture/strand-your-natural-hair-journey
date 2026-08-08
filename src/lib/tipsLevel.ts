/**
 * Tips Level — dynamic support scale (1–3).
 *
 * EXACTLY THREE LEVELS, and each one shows a genuinely different amount:
 *
 * 1 Minimal      — the single highest-priority tip per context: the action and
 *                  a one-sentence why. No explanatory prose, no how-to detail,
 *                  no beginner definitions.
 * 2 Essential    — the top two or three tips: action, one-sentence why, and the
 *                  concrete how (technique). NO extended "why" prose — that is
 *                  the bloat this level exists to avoid. (default)
 * 3 Hand-holding — everything: every tip, the extended personalised "why", the
 *                  step-by-step technique, "next wash day", plain-English
 *                  definitions, do/don't pairs and encouragement. This level
 *                  must never show less than level 2.
 *
 * Legacy values: the scale used to run 1–4 with a "Guided" level 3. Old level 3
 * now coerces to Essential and old level 4 to Hand-holding, so stored profiles
 * keep roughly the density their owner chose.
 *
 * Stored on `profiles.tips_level` (smallint) and mirrored into localStorage so
 * the first render doesn't flash the wrong density while the profile loads.
 */
export type TipsLevel = 1 | 2 | 3;

export const TIPS_LEVEL_STORAGE_KEY = "strand.tipsLevel";
export const TIPS_LEVEL_PROMPTED_KEY = "strand.tipsLevelPrompted";

export const DEFAULT_TIPS_LEVEL: TipsLevel = 2;

export const TIPS_LEVELS: TipsLevel[] = [1, 2, 3];

export const isTipsLevel = (value: unknown): value is TipsLevel =>
  value === 1 || value === 2 || value === 3;

/** Accepts numbers, numeric strings, the legacy 4-level scale and the legacy
 *  "essential"/"detailed" values, and always returns a valid level. */
export function coerceTipsLevel(value: unknown): TipsLevel {
  if (value === "essential") return 2;
  if (value === "detailed") return 3;
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 1) return 1;
  if (n === 2) return 2;
  // Legacy: old 3 (Guided) collapses into Essential, old 4 stays Hand-holding.
  if (n === 3) return 2;
  if (n === 4) return 3;
  return DEFAULT_TIPS_LEVEL;
}

export const TIPS_LEVEL_LABEL: Record<TipsLevel, string> = {
  1: "Minimal",
  2: "Essential",
  3: "Hand-holding",
};

export const TIPS_LEVEL_HINT: Record<TipsLevel, string> = {
  1: "Just the one thing that matters most, and why. For confident routines.",
  2: "The two or three priorities, each with the why and how to do it.",
  3: "The most detail of any level — every step in full, in plain language, with what to avoid.",
};

/** How many tips each level shows in a single context. */
export const TIPS_LEVEL_MAX: Record<TipsLevel, number> = {
  1: 1,
  2: 3,
  3: Number.POSITIVE_INFINITY,
};

/**
 * Trim a tip list to the level's quantity.
 * Tips should be passed in priority order (most important first) so lower
 * levels always keep the ones that matter most. Pass `priority` to rank an
 * unordered list — higher priority values come first (stable within ties).
 */
export function limitTips<T>(
  tips: T[] | null | undefined,
  level: TipsLevel,
  priority?: (tip: T, index: number) => number,
): T[] {
  const list = [...(tips ?? [])];
  if (priority) {
    list
      .map((t, i) => ({ t, i, p: priority(t, i) }))
      .sort((a, b) => b.p - a.p || a.i - b.i)
      .forEach((entry, idx) => {
        list[idx] = entry.t;
      });
  }
  const max = TIPS_LEVEL_MAX[level];
  return Number.isFinite(max) ? list.slice(0, max) : list;
}

/**
 * True when the level wants the EXTENDED "why" prose behind a tip.
 *
 * Hand-holding only. Levels 1 and 2 always carry a one-sentence reason on the
 * tip itself — that is the tip's own field, not an explanation block — so the
 * extended prose here is pure duplication below level 3.
 */
export const showsExplanations = (level: TipsLevel): boolean => level >= 3;

/** True when the level wants inline beginner definitions of technical terms
 *  (porosity, surfactants, elasticity…) and extra encouragement. */
export const showsBeginnerHelp = (level: TipsLevel): boolean => level >= 3;

/** True when the level wants the concrete how-to (technique, step detail). */
export const showsTechnique = (level: TipsLevel): boolean => level >= 2;

/** Instruction block appended to AI prompts so generated copy matches the
 *  user's chosen support level. Mirrored in
 *  supabase/functions/_shared/tips-level.ts. */
export const TIPS_LEVEL_AI_DIRECTIVE: Record<TipsLevel, string> = {
  1: "Support level 1 (Minimal): give only the single highest-priority point per section — the action plus ONE short sentence of why. Concise, direct, no preamble, no definitions, no extended explanation.",
  2: "Support level 2 (Essential): give the top two or three priority points per section. Each point is the action, ONE sentence of why, and the concrete how. Do NOT add extended explanatory prose — the one-sentence why is the whole explanation at this level.",
  3: "Support level 3 (Hand-holding, \"dummies guide\" mode): this level shows the MOST information of any level — never less than level 2. Include every step, every tip and every piece of guidance in full, all at once; never hide, collapse or defer anything to a later step. Add the extended why: the fuller personalised explanation against this member's own recorded profile and logged wash days, which must add NEW context rather than restating the one-sentence reason. Write for someone who has NEVER done their own hair. Reading age 9-10. Short sentences, one action per line, numbered as a complete sequence from first to last step (\"1. Wet your hair fully. 2. Put a coin-sized amount of shampoo in your palm.\"). For each step say what to do, how to do it, how long it takes, what it should look or feel like, and what to avoid. No jargon at all: where a technical term is unavoidable, give the plain-English phrase first and the term in brackets, e.g. \"how easily your hair drinks up water (this is called porosity)\". State timings in plain minutes. Give clear do and don't pairs where practice can go wrong. Warm, friendly, zero assumed knowledge.",
};
