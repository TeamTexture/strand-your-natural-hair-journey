// Structured match-score reasons — "show your working" for the product
// verdict box. Shared by product-analyse (photo), product-analyse-url and
// ingredient-analysis so all three providers emit an identical shape.
//
// Contract: 2–4 items, each { direction, factor, reason }.
//   - direction: "plus" (earned points) | "minus" (cost points)
//   - factor:    the concrete ingredient or formulation property
//   - reason:    ≤18 words, MUST name the user characteristic, goal or
//                flagged marker it interacts with. Anything that could be
//                said to any user is invalid and dropped.

export interface ScoreReason {
  direction: "plus" | "minus";
  factor: string;
  reason: string;
}

/** JSON-schema fragment for the tool/response schema (both providers). */
export const SCORE_REASONS_SCHEMA_PROPERTY = {
  type: "array",
  minItems: 2,
  maxItems: 4,
  description:
    "2–4 items showing exactly what earned and what cost points on match_score, tied to THIS user's characteristics, goals or flagged markers. Include at least one 'minus' unless the formula genuinely has no downside for this user, and at least one 'plus' unless nothing in the formula helps them.",
  items: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["plus", "minus"],
        description: "'plus' = raised the score, 'minus' = lowered it.",
      },
      factor: {
        type: "string",
        description:
          "The concrete ingredient or formulation property responsible, named in ≤6 words. Examples: 'SLES surfactant', 'Behentrimonium methosulfate', 'No film-forming silicones', 'Glycerin high in the list'. Never a vague quality like 'good formulation'.",
      },
      reason: {
        type: "string",
        description:
          "≤18 words tying that factor to a NAMED user signal — their porosity, density, texture, scalp condition, current style, a stated goal or a flagged blood marker. Example minus: 'Strips moisture fast — costly on your high-porosity hair chasing length.' Example plus: 'Smooths the cuticle your high porosity leaves open.' A reason that could apply to anyone is invalid.",
      },
    },
    required: ["direction", "factor", "reason"],
  },
} as const;

/** Prompt block appended to every product-analysis system/task prompt. */
export const SCORE_REASONS_RULES = `SCORE REASONS — THE SCORE MUST EXPLAIN ITSELF:
Return score_reasons: 2–4 items, each { direction: "plus" | "minus", factor, reason }.
- factor names the CONCRETE ingredient or formulation property doing the work, ≤6 words ("SLES surfactant", "Behentrimonium methosulfate", "No film-forming silicones", "Glycerin high in the list"). Never a vague quality like "nice formulation" or "quality ingredients".
- reason is ≤18 words and MUST name the user characteristic, goal or flagged marker it interacts with — their porosity, density, texture, elasticity, scalp condition, current style, a stated goal/challenge, or a flagged marker where THIS product directly intersects it. A reason that could be written for any user is INVALID; rewrite it or drop the item.
- Order the strongest driver first. Include at least one minus unless this formula genuinely has no downside for this user, and at least one plus unless nothing in it helps them.
- CONSISTENCY: match_score must agree with the reasons. Mostly pluses cannot produce a 55; heavy minuses cannot produce an 85. Re-check the number against the list before returning.
- GROUNDING: where the retrieved manuscript passages teach the ingredient or mechanism, reason from that teaching — never name the book, chapters or pages.
- ONE IDEA ONCE: a score reason may NOT restate a use_cases item, a tip, or a key_ingredients reason verbatim. The verdict explains the score; "how to use" builds on it and never repeats it.

AI SUMMARY — ONE SENTENCE ONLY:
ai_summary is now exactly ONE tight sentence: the overall call (good fit / mixed fit / poor fit) and the single signal driving it. The score_reasons carry the why, so do NOT explain the reasoning again in ai_summary and never exceed one sentence.`;

const MAX_REASON_WORDS = 18;
const MAX_FACTOR_WORDS = 6;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

const clampWords = (s: string, max: number) => {
  const w = words(s);
  if (w.length <= max) return s.trim();
  return `${w.slice(0, max).join(" ").replace(/[,;:—-]+$/, "")}…`;
};

/**
 * Normalises whatever the model returned into the strict contract:
 * valid directions, non-empty factor/reason, word caps, deduped, 2–4 items.
 */
export function sanitiseScoreReasons(value: unknown): ScoreReason[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScoreReason[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const direction = row.direction === "plus" || row.direction === "minus"
      ? row.direction
      : null;
    const factor = typeof row.factor === "string" ? row.factor.trim() : "";
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    if (!direction || !factor || !reason) continue;
    const key = `${direction}|${factor.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      direction,
      factor: clampWords(factor, MAX_FACTOR_WORDS),
      reason: clampWords(reason, MAX_REASON_WORDS),
    });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * Keeps the number honest against its own working. We never invent a score
 * from nothing — this only prevents the contradictory cases the prompt bans:
 * an all-plus list scoring low, or an all-minus list scoring high.
 */
export function alignScoreWithReasons(score: number, reasons: ScoreReason[]): number {
  if (reasons.length < 2 || !Number.isFinite(score)) return score;
  const plus = reasons.filter((r) => r.direction === "plus").length;
  const minus = reasons.length - plus;
  if (minus === 0 && score < 65) return 65;
  if (plus === 0 && score > 55) return 55;
  return score;
}

/** Trims ai_summary to a single sentence (the overall call). */
export function firstSentence(text: unknown): string {
  if (typeof text !== "string") return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const m = clean.match(/^.*?[.!?](?=\s|$)/);
  return (m?.[0] ?? clean).trim();
}
