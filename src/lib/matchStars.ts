// ── THE ONE STAR MAPPING FOR THE WHOLE APP ────────────────────────────────
//
// Products and tools both carry a personalised `match_score` (0–100) produced
// by the analysis pipeline (product-analyse, product-analyse-url,
// ingredient-analysis, tool-analyse-url). The stars shown on a thumbnail and
// the score hero shown on the detail page MUST be two views of the SAME
// number — never two independently computed ratings.
//
// MAPPING (canonical, do not re-implement anywhere else):
//   stars = clamp(round((score / 20) * 2) / 2, 0.5, 5)
//   i.e. score / 20, rounded to the NEAREST HALF star.
//   80 → 4, 82 → 4, 85 → 4.5, 90 → 4.5, 95 → 5, 38 → 2, 42 → 2, 45 → 2.5.
//
// An analysed item always shows at least half a star, so "no stars" is an
// unambiguous signal that the item has not been analysed yet. Callers must
// render nothing when `starsFromScore` returns null (never empty grey stars).

/** Points of match score per whole star. */
export const SCORE_PER_STAR = 20;
export const MAX_STARS = 5;

/** Clamps an unknown value into a 0–100 match score, or null if absent. */
export function normaliseMatchScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * The canonical score → stars function. Returns null when there is no score
 * (item not analysed), so the caller can omit stars entirely.
 */
export function starsFromScore(score: unknown): number | null {
  const s = normaliseMatchScore(score);
  if (s == null) return null;
  const halves = Math.round((s / SCORE_PER_STAR) * 2) / 2;
  return Math.max(0.5, Math.min(MAX_STARS, halves));
}

/** Item shapes that carry a match score (products and tools alike). */
export interface MatchScored {
  match_score?: number | null;
  ai_analysis?: unknown;
  score_reasons?: unknown;
}

/**
 * Single source of truth for reading an item's score: the column first, then
 * the cached analysis payload it was derived from. Used by both list rows and
 * detail pages so one item can never show two different ratings.
 */
export function matchScoreOf(item: MatchScored | null | undefined): number | null {
  if (!item) return null;
  const direct = normaliseMatchScore(item.match_score);
  if (direct != null) return direct;
  const analysis = item.ai_analysis;
  if (analysis && typeof analysis === "object") {
    return normaliseMatchScore((analysis as Record<string, unknown>).match_score);
  }
  return null;
}

/** Convenience: item → stars (null when unanalysed). */
export function starsForItem(item: MatchScored | null | undefined): number | null {
  return starsFromScore(matchScoreOf(item));
}

/** "4" / "4.5" — trims the trailing .0 for whole stars. */
export function formatStars(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

/** Tone buckets shared by the score hero and the verdict callout. */
export function scoreTone(score: number): "good" | "gold" | "warning" {
  if (score >= 70) return "good";
  if (score >= 40) return "gold";
  return "warning";
}
