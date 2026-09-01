// TWO AXES, NOT ONE — QUALITY/SAFETY vs RELEVANCE
// ===============================================
// 2026-09-01 (Part 2 of the scan personalisation build).
//
// The single `match_score` was doing two incompatible jobs: judging how well
// the formula is BUILT (quality + safety) and judging how closely its purpose
// matches what the member is working on right now (relevance). A well-made
// product aimed at a different area of her hair kept coming back as a low
// rating, which reads to the member as "this is a bad product".
//
// The split:
//   • `quality_score` — formulation quality and safety only. Nothing about
//     whether its purpose matches her current goal may move it.
//   • `relevance_note` — ONE plain sentence naming what the formula is aimed
//     at and what she recorded, when the two differ. Never a score, never a
//     caution, and rendered as its own row under the verdict — never inside
//     "Why it scored this high/low".
//
// `match_score` stays the field the UI reads (stars, fit band, passport), and
// is derived from the QUALITY/SAFETY axis only. Relevance never touches it.

import { isRelevanceFraming, type StrandTipNote } from "./fit-first-score.ts";
import type { ScoreReason } from "./score-reasons.ts";

/** Formulation quality + safety, with relevance explicitly excluded. */
export const QUALITY_SCORE_SCHEMA_PROPERTY = {
  type: ["integer", "null"],
  minimum: 0,
  maximum: 100,
  description:
    "0-100 for HOW WELL THIS PRODUCT IS MADE AND HOW SAFE IT IS FOR THIS MEMBER, judged on the real ingredient list alone: the substance of its actives, the sense of the formulation, and any genuine conflict with her recorded profile or a declared sensitivity. Whether the product's PURPOSE matches what she is currently working on must NOT change this number — that belongs in relevance_note. Null only when the ingredient list is too incomplete to judge.",
} as const;

/** One plain sentence describing a purpose mismatch. Never a caution. */
export const RELEVANCE_NOTE_SCHEMA_PROPERTY = {
  type: ["string", "null"],
  description:
    "ONE calm sentence, max 30 words, naming what this formula is built to do and what she recorded, ONLY when the two differ (e.g. 'This is built around density and regrowth support rather than the breakage and length retention you recorded.'). No 'avoid', 'caution', 'unfortunately'. Return null when the formula does serve her recorded goal, challenges or areas of concern — null is the preferred answer.",
} as const;

export const RELEVANCE_AXIS_RULES = `TWO SEPARATE AXES — QUALITY/SAFETY AND RELEVANCE (never mix them into one number):
- quality_score answers ONLY: is this well formulated and safe for her? Judge the actives actually in the list, the sense of the formulation, and any genuine conflict with her recorded profile or a declared sensitivity. A product aimed at a different area of her hair is NOT a quality problem and must not reduce quality_score by a single point.
- relevance_note answers a different question: is its purpose what she is working on right now? Write one calm sentence naming what the formula is built for and what she recorded — ONLY when they differ. Return null when the formula does serve her goal, challenges or recorded areas of concern.
- match_score is derived from the quality/safety axis. Never lower it for relevance, and never describe relevance as a reason for the score.
- score_reasons stay on the quality/safety axis: mechanisms in the formula and how they land on her recorded characteristics. A purpose mismatch NEVER appears as a "minus" — it goes in relevance_note.`;

/** Narrows an unknown model field into a clean single-sentence note. */
export function sanitiseRelevanceNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\b(?:unfortunately|caution|beware|warning|avoid)\b[:,]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text.length < 12) return null;
  const words = text.split(/\s+/);
  return words.length > 34 ? `${words.slice(0, 34).join(" ").replace(/[,;:]$/, "")}.` : text;
}

/**
 * Fallback: when the model wrote the mismatch as a score reason instead of
 * filling `relevance_note`, reuse its own sentence rather than inventing one.
 * Only relevance-framed rows qualify — a real conflict is never a relevance
 * note.
 */
export function relevanceNoteFromReasons(
  reasons: ScoreReason[],
  tips: StrandTipNote[] = [],
): string | null {
  for (const r of reasons) {
    if (r.direction !== "minus") continue;
    const text = `${r.factor} ${r.reason}`;
    if (isRelevanceFraming(text)) return sanitiseRelevanceNote(r.reason);
  }
  for (const t of tips) {
    const text = `${t.title} ${t.note}`;
    if (isRelevanceFraming(text)) return sanitiseRelevanceNote(t.note);
  }
  return null;
}

export interface ScoreAxes {
  /** The number the UI reads. Quality/safety only. */
  score: number | null;
  /** The quality/safety axis as resolved (same value, kept for the payload). */
  qualityScore: number | null;
  /** The relevance sentence, or null when the purpose does match. */
  relevanceNote: string | null;
}

/**
 * Resolves the two axes BEFORE fit-first scoring runs, so everything
 * downstream (fit-first floors, concern-fit lift, stars, fit band) works off
 * the quality/safety number and never off a relevance-contaminated one.
 */
export function resolveScoreAxes(input: {
  matchScore?: unknown;
  qualityScore?: unknown;
  relevanceNote?: unknown;
  reasons?: ScoreReason[];
  strandTips?: StrandTipNote[];
}): ScoreAxes {
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number.NaN;
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  const quality = num(input.qualityScore);
  const match = num(input.matchScore);
  // The quality axis wins when the model supplied it. With no quality axis we
  // keep the single number we were given — never invent one.
  const score = quality ?? match;

  const note =
    sanitiseRelevanceNote(input.relevanceNote) ??
    relevanceNoteFromReasons(input.reasons ?? [], input.strandTips ?? []);

  return { score, qualityScore: quality ?? score, relevanceNote: note };
}
