/**
 * Tips density preference.
 *
 * "essential" — show only the single highest-priority tip in each context.
 * "detailed"  — hand-holding mode, show the full tip set (default).
 *
 * Stored on `profiles.tips_level` and mirrored into localStorage so the very
 * first render doesn't flash the wrong density while the profile loads.
 */
export type TipsLevel = "essential" | "detailed";

export const TIPS_LEVEL_STORAGE_KEY = "strand.tipsLevel";
export const TIPS_LEVEL_PROMPTED_KEY = "strand.tipsLevelPrompted";

export const DEFAULT_TIPS_LEVEL: TipsLevel = "detailed";

export const isTipsLevel = (value: unknown): value is TipsLevel =>
  value === "essential" || value === "detailed";

/** Trim a tip list down to the preferred density. */
export function limitTips<T>(tips: T[] | null | undefined, level: TipsLevel): T[] {
  const list = tips ?? [];
  return level === "essential" ? list.slice(0, 1) : list;
}

export const TIPS_LEVEL_LABEL: Record<TipsLevel, string> = {
  essential: "Essential",
  detailed: "Detailed",
};

export const TIPS_LEVEL_HINT: Record<TipsLevel, string> = {
  essential: "Just the one thing that matters most in each place.",
  detailed: "Full guidance — every tip we have for you.",
};
