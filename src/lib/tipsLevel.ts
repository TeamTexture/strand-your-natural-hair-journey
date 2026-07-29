/**
 * Tips Level — dynamic support scale (1–4).
 *
 * 1 Minimal      — one single highest-priority tip per context, no extras.
 * 2 Essentials   — top 2–3 priority tips, short-form wording.
 * 3 Guided       — most tips, with the "why" behind each (default).
 * 4 Hand-holding — everything: full explanations, step-by-step framing,
 *                  encouragement and inline beginner definitions.
 *
 * Stored on `profiles.tips_level` (smallint) and mirrored into localStorage so
 * the first render doesn't flash the wrong density while the profile loads.
 */
export type TipsLevel = 1 | 2 | 3 | 4;

export const TIPS_LEVEL_STORAGE_KEY = "strand.tipsLevel";
export const TIPS_LEVEL_PROMPTED_KEY = "strand.tipsLevelPrompted";

export const DEFAULT_TIPS_LEVEL: TipsLevel = 3;

export const TIPS_LEVELS: TipsLevel[] = [1, 2, 3, 4];

export const isTipsLevel = (value: unknown): value is TipsLevel =>
  value === 1 || value === 2 || value === 3 || value === 4;

/** Accepts numbers, numeric strings and the legacy "essential"/"detailed"
 *  values, and always returns a valid level. */
export function coerceTipsLevel(value: unknown): TipsLevel {
  if (isTipsLevel(value)) return value;
  if (value === "essential") return 2;
  if (value === "detailed") return 3;
  const n = typeof value === "string" ? Number(value) : value;
  return isTipsLevel(n) ? n : DEFAULT_TIPS_LEVEL;
}

export const TIPS_LEVEL_LABEL: Record<TipsLevel, string> = {
  1: "Minimal",
  2: "Essentials",
  3: "Guided",
  4: "Hand-holding",
};

export const TIPS_LEVEL_HINT: Record<TipsLevel, string> = {
  1: "Just the one thing that matters most. For confident routines.",
  2: "The top two or three priorities, kept short.",
  3: "Most tips, with the reasoning behind each one.",
  4: "Everything explained — step by step, in beginner language.",
};

/** How many tips each level shows in a single context. */
export const TIPS_LEVEL_MAX: Record<TipsLevel, number> = {
  1: 1,
  2: 3,
  3: 6,
  4: Number.POSITIVE_INFINITY,
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

/** True when the level wants the "why" behind a tip shown. */
export const showsExplanations = (level: TipsLevel): boolean => level >= 3;

/** True when the level wants inline beginner definitions of technical terms
 *  (porosity, surfactants, elasticity…) and extra encouragement. */
export const showsBeginnerHelp = (level: TipsLevel): boolean => level >= 4;

/** Instruction block appended to AI prompts so generated copy matches the
 *  user's chosen support level. Mirrored in
 *  supabase/functions/_shared/tips-level.ts. */
export const TIPS_LEVEL_AI_DIRECTIVE: Record<TipsLevel, string> = {
  1: "Support level 1 (Minimal): give only the single highest-priority point per section. Concise, direct, no preamble, no definitions.",
  2: "Support level 2 (Essentials): give the top two or three priority points per section, short-form wording, minimal explanation.",
  3: "Support level 3 (Guided): give most points with a clear explanation of the why behind each one, in plain but assured language.",
  4: "Support level 4 (Hand-holding): give everything, in beginner language. Explain the why in full, frame actions step by step, define technical terms inline the first time they appear (porosity, surfactant, elasticity, density, clarifying), and include warm encouragement.",
};
