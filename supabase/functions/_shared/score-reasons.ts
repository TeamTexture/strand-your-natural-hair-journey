// Structured match-score reasons — "show your working" for the product
// verdict box. Shared by product-analyse (photo), product-analyse-url and
// ingredient-analysis so all three providers emit an identical shape.
//
// Contract: 2–4 items, each { direction, factor, reason }.
//   - direction: "plus" (earned points) | "minus" (cost points)
//   - factor:    the concrete ingredient or formulation property
//   - reason:    ≤28 words, MUST state the MECHANISM (what the ingredient
//                physically does) and name the user characteristic, goal or
//                flagged marker it interacts with. Anything that could be
//                said to any user is invalid and dropped.

import { FIT_FIRST_SCORE_RULES } from "./fit-first-score.ts";
import { CONCERN_FIT_RULES } from "./concern-fit.ts";

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
          "The concrete ingredient or formulation property responsible, named in ≤8 words. Examples: 'SLES surfactant', 'Behentrimonium methosulfate', 'No film-forming silicones', 'Glycerin high in the list'. Never a vague quality like 'good formulation'.",
      },
      reason: {
        type: "string",
        description:
          "≤28 words: the MECHANISM first (what this ingredient physically does to hair or scalp), then the NAMED user signal it lands on — their porosity, density, texture, elasticity, scalp condition, current style, a stated goal or a flagged blood marker. Example plus: 'A mild non-ionic surfactant, so it lifts sebum without stripping the lipids your high porosity already struggles to hold.' Example minus: 'Denatured alcohol evaporates fast and takes surface water with it — costly on hair already chasing length.' A reason with no mechanism, or one that could apply to anyone, is invalid.",
      },
    },
    required: ["direction", "factor", "reason"],
  },
} as const;


// ── THE SHARED FAILSAFE RULES (2026-08-28) ────────────────────────────────
// Appended to BOTH rule blocks below, which every analysis function already
// embeds. Prompt rules therefore cannot reach one analysis surface and miss
// another — the same way `sanitiseScoreReasons` already can't.
export const ANALYSIS_FAILSAFE_RULES = `
${FIT_FIRST_SCORE_RULES}

${CONCERN_FIT_RULES}

CLOSED HAIR/SCALP VOCABULARY (hard validation runs on your output):
Porosity, elasticity, cuticle, cortex, strand diameter, surface texture and curl pattern describe the HAIR STRAND. Density, sebum, follicles, flaking, irritation, hairline, edges and partings describe the SCALP. Never cross the two and never weld them into a new term: "porosity scalp", "scalp porosity", "follicle elasticity" and "cuticle of the scalp" are not real concepts and are rejected outright. Use only terminology the app already teaches; if no approved term fits, say nothing or return null for the field.

NULLABILITY:
Every descriptive and categorical field is nullable. Where you do not have real grounded data, return null — that is the correct and preferred answer. Never fill a field with a plausible guess, an inferred value or a generic statement to avoid leaving it empty.

OVERALL FIT LANGUAGE — MUST MATCH THE SCORE:
The member reads a verdict label derived from match_score: 90+ "a strong fit", 70-89 "a good fit", 50-69 "a mixed fit", 30-49 "not an ideal fit", under 30 "a poor fit". Any overall-fit wording in ai_summary must be the phrase for the band your own score falls in. Never call a product a mixed fit while scoring it 70+, or a good fit while scoring it low. If the honest verdict is mixed, return a mixed-band score.`;

/** Prompt block appended to every product-analysis system/task prompt. */
export const SCORE_REASONS_RULES = `SCORE REASONS — THE SCORE MUST EXPLAIN ITSELF:
Return score_reasons: 2–4 items, each { direction: "plus" | "minus", factor, reason }.
- factor names the CONCRETE ingredient or formulation property doing the work, ≤8 words ("SLES surfactant", "Behentrimonium methosulfate", "No film-forming silicones", "Glycerin high in the list"). Never a vague quality like "nice formulation" or "quality ingredients".
- reason is ≤28 words and MUST do BOTH: state the MECHANISM (what the ingredient physically does — cleanses, binds water, coats, evaporates, softens, buffers pH, adds surface film) AND name the user characteristic, goal or flagged marker it lands on — their porosity, density, texture, elasticity, scalp condition, current style, a stated goal/challenge, or a flagged marker where THIS product directly intersects it. A reason with no mechanism, or one that could be written for any user, is INVALID; rewrite it or drop the item.
- USE THE APP'S OWN VOCABULARY. Where a mechanism has a taught term, name it: surfactant, humectant, emollient, occlusive, protein, cuticle, cortex, porosity, elasticity, sebum, build-up, slip, pH, hygral fatigue, molecular weight. These render as tappable definitions for the member, so the plain-English mechanism plus the correct term is better than either alone. Never coin a term that is not taught.
- RANKED: the rows are displayed as a numbered ranking, strongest driver first. Row 1 must be the single biggest reason the score is what it is. Include at least one minus unless this formula genuinely has no downside for this user, and at least one plus unless nothing in it helps them.
- HERO ACTIVES FIRST — NEVER THE SUPPORTING CAST: lead with the ingredients that genuinely drive the fit to HER profile, concerns and challenges — the functional actives the formula is built around (peptides, cysteinates, hydrolysed proteins, ceramides, bond builders, named scalp actives, the working surfactant or conditioning system). Humectants (glycerin), preservatives, pH adjusters, buffers, emulsifiers and solvents go LAST or not at all. If the formula's headline mechanism serves her recorded area of concern or a recorded challenge, that ingredient MUST appear in the reasons BY NAME — omitting it and citing glycerin instead is a failed answer and is rejected.
- CONSISTENCY: match_score must agree with the reasons. Mostly pluses cannot produce a 55; heavy minuses cannot produce an 85. Re-check the number against the list before returning.
- GROUNDING: where the retrieved manuscript passages teach the ingredient or mechanism, reason from that teaching — never name the book, chapters or pages.
- ONE IDEA ONCE: a score reason may NOT restate a use_cases item, a tip, or a key_ingredients reason verbatim. The verdict explains the score; "how to use" builds on it and never repeats it.

AI SUMMARY — ONE SENTENCE ONLY:
ai_summary is now exactly ONE tight sentence: the overall call (good fit / mixed fit / poor fit) and the single signal driving it. The score_reasons carry the why, so do NOT explain the reasoning again in ai_summary and never exceed one sentence.

${ANALYSIS_FAILSAFE_RULES}`;

const MAX_REASON_WORDS = 28;
const MAX_FACTOR_WORDS = 8;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/**
 * Word budgets are enforced by DROPPING whole trailing sentences, never by
 * cutting mid-sentence. A half-sentence ending in an ellipsis reads as broken
 * copy, so if the first sentence already exceeds the budget we keep it whole.
 */
const clampWords = (s: string, max: number) => {
  const text = s.trim();
  if (!text) return "";
  if (words(text).length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  let kept = "";
  for (const sentence of sentences) {
    const candidate = (kept + sentence).trim();
    if (kept && words(candidate).length > max) break;
    kept = candidate + " ";
  }
  return kept.trim() || text;
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
import { minusIsScoreWorthy } from "./fit-first-score.ts";

export function alignScoreWithReasons(score: number, reasons: ScoreReason[]): number {
  if (reasons.length < 2 || !Number.isFinite(score)) return score;
  const plus = reasons.filter((r) => r.direction === "plus").length;
  // Only genuine conflicts/harms count against the score. A relevance
  // observation ("targets a different concern") is not a minus (2026-08-30).
  const minus = reasons.filter(
    (r) => r.direction !== "plus" && minusIsScoreWorthy(r),
  ).length;
  // No genuine conflict or harm: the number may not read as a caution, even if
  // the model wrote every reason as a relevance observation.
  if (minus === 0) return score < 65 ? 65 : score;
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

/**
 * TOOL variant of the score-reasons rules. Same contract and same sanitiser —
 * only the definition of `factor` changes: tools have no ingredients, so the
 * factor is a physical/mechanical property of the tool (bristle type, tooth
 * spacing, heat range, material, retained warmth) rather than an INCI entry.
 */
export const TOOL_SCORE_REASONS_RULES = `SCORE REASONS — THE SCORE MUST EXPLAIN ITSELF:
Return score_reasons: 2–4 items, each { direction: "plus" | "minus", factor, reason }.
- factor names the CONCRETE physical or mechanical property of the tool doing the work, ≤8 words ("Fine-tooth spacing", "Retained warmth under the cap", "230°C top heat", "Satin-lined interior", "Rigid nylon bristles", "Ionic diffuser vents"). Tools have NO ingredients — never name a formulation. Never a vague quality like "well made" or "great design".
- reason is ≤28 words and MUST state the MECHANISM (what the tool physically does to hair or scalp) and name the user characteristic, goal or flagged marker that property interacts with — their porosity, density, texture, diameter, elasticity, scalp condition, current or planned style (including tension and extensions), a stated goal/challenge, or a flagged marker the tool's mechanism actually touches. A reason that could be written for any user is INVALID; rewrite it or drop the item.
- RELEVANCE GATE: only cite a signal the tool's mechanism genuinely acts on. A satin pillowcase does not interact with tight braids' tension; a comb does not interact with ferritin; a bonnet does not interact with heat damage. If a signal is not mechanically touched by this tool, leave it out rather than reaching for it.
- Order the strongest driver first. Include at least one minus unless this tool genuinely has no downside for this user, and at least one plus unless nothing about it helps them.
- CONSISTENCY: match_score must agree with the reasons. Mostly pluses cannot produce a 55; heavy minuses cannot produce an 85. Re-check the number against the list before returning.
- GROUNDING: where the retrieved manuscript passages teach the mechanism (heat and moisture, detangling, tension, friction, porosity), reason from that teaching — never name the book, chapters or pages.
- ONE IDEA ONCE: a score reason may NOT restate a use_cases item, a tip, a key_features relevance or the how_to_use text verbatim. The verdict explains the score; "how to use" builds on it and never repeats it.

AI SUMMARY — ONE SENTENCE ONLY:
ai_summary is now exactly ONE tight sentence: the overall call (good fit / mixed fit / poor fit) and the single signal driving it. The score_reasons carry the why, so do NOT explain the reasoning again in ai_summary and never exceed one sentence.

${ANALYSIS_FAILSAFE_RULES}`;

// ── HERO ACTIVES LEAD THE VERDICT (2026-08-30) ────────────────────────────
// The K18 row scored 88 for a member with thinning edges and the three plus
// reasons named niacinamide, zinc sulfate and glycerin — the supporting cast —
// while the peptide system that is the actual reason the product suits her was
// never mentioned. Two deterministic guards:
//   1. `rankScoreReasons` re-orders pluses so headline actives outrank
//      humectants, pH adjusters, preservatives and emulsifiers,
//   2. `heroActiveOmissions` produces a RETRY instruction when the formula
//      holds a headline active and no reason names it.

/** Support-cast classes: real, useful, never the headline of a verdict. */
const SUPPORT_CAST_FACTOR =
  /\bwater\b|\baqua\b|\bglycerin\b|\bpreservative\b|\bsodium benzoate\b|\bpotassium sorbate\b|\bphenoxyethanol\b|\bcitric acid\b|\bsodium hydroxide\b|\bphosphate\b|\bpolysorbate\b|\bpeg-\d+\b|\bxanthan\b|\bcellulose\b|\bcarbomer\b|\bfragrance\b|\bparfum\b|\bmica\b|\bph adjust|\bbuffer|\bemulsifier\b|\bthickener\b|\bsolvent\b|\bhumectant\b/i;

/** Headline functional actives — what a formula is actually built around. */
const HEADLINE_ACTIVE_FACTOR =
  /\bpeptide\b|\bdipeptide\b|\btripeptide\b|\btetrapeptide\b|\bcysteinate\b|\bcystein\b|\bkeratin\b|\bhydroly[sz]ed\b|\bceramide\b|\bbond\b|\bprotein\b|\bamino acid\b/i;

const SECONDARY_ACTIVE_FACTOR =
  /\bniacinamide\b|\bzinc\b|\bpanthenol\b|\bcaffeine\b|\bbiotin\b|\bsurfactant\b|\bbehentrimonium\b|\bsilicone\b|\bemollient\b|\bocclusive\b|\boil\b|\bbutter\b/i;

const factorWeight = (r: ScoreReason): number => {
  const hay = `${r.factor} ${r.reason}`;
  if (HEADLINE_ACTIVE_FACTOR.test(hay)) return 3;
  if (SECONDARY_ACTIVE_FACTOR.test(hay) && !SUPPORT_CAST_FACTOR.test(r.factor)) return 2;
  if (SUPPORT_CAST_FACTOR.test(hay)) return 0;
  return 1;
};

/**
 * Stable re-ordering: pluses first (fit-first already guarantees that), and
 * inside the pluses, headline actives above the supporting cast. Never drops or
 * rewrites a row — ordering only.
 */
export function rankScoreReasons(reasons: ScoreReason[]): ScoreReason[] {
  const withIndex = reasons.map((r, i) => ({ r, i, w: factorWeight(r) }));
  const plus = withIndex.filter((x) => x.r.direction === "plus");
  const minus = withIndex.filter((x) => x.r.direction !== "plus");
  const sort = (rows: typeof withIndex) =>
    [...rows].sort((a, b) => (b.w - a.w) || (a.i - b.i)).map((x) => x.r);
  return [...sort(plus), ...sort(minus)];
}

/** Names of the formula's headline actives, from the verified INCI list. */
export function headlineActives(ingredients: string[] | undefined | null): string[] {
  return (ingredients ?? [])
    .map((i) => String(i ?? "").trim())
    .filter((n) => n && HEADLINE_ACTIVE_FACTOR.test(n) && !SUPPORT_CAST_FACTOR.test(n));
}

/**
 * Retry instruction when the verdict ignores the formula's hero actives.
 * Deterministic and conservative: only fires when such an ingredient exists in
 * the verified list and no reason mentions any distinctive word from its name.
 */
export function heroActiveOmissions(
  reasons: ScoreReason[],
  ingredients: string[] | undefined | null,
): string[] {
  const heroes = headlineActives(ingredients);
  if (!heroes.length || !reasons.length) return [];
  const hay = reasons.map((r) => `${r.factor} ${r.reason}`).join(" | ").toLowerCase();
  const named = heroes.some((h) =>
    h
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length > 4)
      .some((w) => hay.includes(w))
  );
  if (named) return [];
  return [
    `score_reasons ignore this formula's headline actives (${heroes.slice(0, 3).join(", ")}) and cite supporting-cast ingredients instead. Rewrite the reasons so the ingredient(s) that genuinely drive the fit to this member's profile, recorded challenges and areas of concern are named FIRST, with their real mechanism. Humectants, preservatives, pH adjusters and emulsifiers may only appear after them, or not at all.`,
  ];
}
