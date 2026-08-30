// FIT-FIRST SCORING — match_score is a FIT verdict, not a caution tally
// =====================================================================
// 2026-08-28, rule change (not a wording change).
//
// PRIMARY driver of match_score: how well this product serves the member's
// stated GOAL and CHALLENGE, evidenced by named real ingredients from the
// actual list and why each one is relevant to that goal/challenge.
//
// Only two things may LOWER the score:
//   1. a genuine CONFLICT with her stated goal, challenge or recorded profile
//      (an ingredient that works against what she is trying to achieve), or
//   2. a genuine HARM risk — a declared sensitivity/allergy conflict, or a
//      real safety concern.
//
// Mild, non-harmful "worth knowing" observations may NEVER lower the score.
// They move to the STRAND TIP: food-for-thought rendered separately, below the
// rating, never described as part of why the score is what it is.

import type { ScoreReason } from "../_shared/score-reasons.ts";

export interface StrandTipNote {
  title: string;
  note: string;
}

/** Schema fragment for the new field. Nullable: no tip is a valid answer. */
export const STRAND_TIP_SCHEMA_PROPERTY = {
  type: ["array", "null"],
  maxItems: 2,
  description:
    "0-2 mild, NON-harmful observations worth knowing about this formula that must NOT affect match_score — food for thought, never caution. Examples: a fragrance blend she may or may not enjoy, a texture that behaves differently in humidity, a preservative worth watching if her scalp has reacted before. Anything that genuinely conflicts with her goal/challenge or could cause harm belongs in score_reasons instead, never here. Return null when there is nothing worth saying — that is the preferred answer over padding.",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short neutral label, max 6 words. Never a warning." },
      note: { type: "string", description: "One sentence, max 28 words, neutral and calm. No 'avoid', 'caution', 'beware', 'watch out'." },
    },
    required: ["title", "note"],
  },
} as const;

export const FIT_FIRST_SCORE_RULES = `MATCH SCORE — FIT FIRST, NOT CAUTION FIRST (this overrides any older scoring habit):
The score answers ONE question: how well does this product serve THIS member's stated goal and challenge? Start from the goal and the challenge, look at the ingredients that are actually in the list, and score how much real help is in the formula for what she is trying to achieve.
- Points are EARNED by named real ingredients from the supplied list whose mechanism serves her stated goal or challenge. Say which ingredient and why it matters for THAT goal/challenge.
- ONLY TWO THINGS MAY LOWER THE SCORE:
  1. a genuine CONFLICT — an ingredient or property that works against her stated goal, challenge or recorded profile (e.g. something that works against length retention for her recorded porosity), or
  2. a genuine HARM risk — a declared sensitivity or allergy in her record, or a real safety concern.
- NOTHING ELSE LOWERS IT. Routine preservatives, fragrance she has never reacted to, colourants, pH adjusters, "some people find", "worth knowing", "monitor how your scalp feels", ownership frequency, an ingredient sitting low in the list with no relevance to her goal — none of these cost a single point.
- A product with strong goal-relevant ingredients and no real conflict SCORES HIGH (80+). Do not hedge the number downward for balance, and never split the difference to look cautious.
- score_reasons must LEAD with the fit: the first item is a "plus" stating clearly WHY it scored as high as it did, in terms of her goal or challenge. Only include a "minus" when it meets test 1 or test 2 above — there is no requirement to produce a minus at all.
- RELEVANCE IS NOT A PENALTY. "This targets X rather than her stated Y", "no ingredients aimed specifically at her goal", "formulated for a different concern" are RELEVANCE observations, not conflicts and not harm. They may NEVER lower the score and may never appear as a "minus" — put them in strand_tip. A well-formulated product that simply addresses a different area of her hair still scores on its own quality and safety.
- Read her recorded AREAS OF CONCERN (e.g. edges, hairline, crown, nape) as first-class goal signals alongside her written goal and challenges: work on density, regrowth, shedding or scalp condition IS directly relevant to thinning edges or a receding hairline, and must be scored as a plus when the formula supports it.
- Never use hair-typing terminology (3C, 4C, "type 4", numeric/letter types). Say "Afro and textured hair", or name the recorded characteristic (porosity, density, strand diameter, curl pattern description).
- Mild, non-harmful observations go in strand_tip instead, and strand_tip NEVER affects the score. Never describe a strand_tip item as a reason for the score.`;

/** Relevance framing: a mismatch of purpose, not a conflict or a harm. */
const RELEVANCE_MISMATCH = [
  /\brather than\b/i,
  /\binstead of\b/i,
  /\bnot (?:aimed|targeted|formulated|designed|intended)\b/i,
  /\bdoes(?:n't| not) (?:target|address|focus)\b/i,
  /\bdifferent (?:concern|goal|priority|purpose|area)\b/i,
  /\bno ingredients (?:specifically |directly )?(?:for|aimed|targeting)\b/i,
  /\bunrelated to (?:her|your) (?:goal|concern|challenge)\b/i,
  /\blittle (?:direct )?(?:benefit|relevance) (?:for|to) (?:her|your) (?:goal|concern|challenge)\b/i,
];

/** "Targets X … not / rather than her Y" in any phrasing is relevance framing.
 *  The K18 regression slipped past the list above because the model wrote
 *  "targets ageing and shedding — not the breakage challenge": no listed
 *  phrase matched, so a purpose mismatch was scored as a conflict. */
const TARGETS_VERB = /\btarget(?:s|ed|ing)?\b|\baimed at\b|\bformulated for\b|\bdesigned for\b|\bintended for\b|\bfocus(?:es|ed)? on\b/i;
const NEGATION = /\bnot\b|\brather than\b|\binstead of\b|\bwhereas\b/i;

const isRelevanceFraming = (text: string) =>
  any(RELEVANCE_MISMATCH, text) || (TARGETS_VERB.test(text) && NEGATION.test(text));



const HARM_MARKERS = [
  /\bsensitivit/i,
  /\ballerg/i,
  /\bintoleran/i,
  /\bdeclared\b/i,
  /\bavoid completely\b/i,
  /\bunsafe\b/i,
  /\bburn/i,
  /\bblister/i,
  /\bchemical burn\b/i,
  /\bnot safe\b/i,
];

const CONFLICT_MECHANISM = [
  /\bstrips?\b/i,
  /\bdries?\b/i,
  /\bdrying\b/i,
  /\bweighs? (?:it |them |her |the hair )?down\b/i,
  /\bworks? against\b/i,
  /\bundermin/i,
  /\bconflicts?\b/i,
  /\bblocks?\b/i,
  /\bprevents?\b/i,
  /\baggravat/i,
  /\bclogs?\b/i,
  /\bcosts?\b/i,
  /\bcostly\b/i,
  /\bsnaps?\b/i,
  /\bbreak(?:s|age)\b/i,
  /\bstiff/i,
  /\bcoats? and\b/i,
];

const PROFILE_SIGNAL = [
  /\bporosity\b/i,
  /\belasticity\b/i,
  /\bdensity\b/i,
  /\bstrand diameter\b/i,
  /\bsurface texture\b/i,
  /\bcurl pattern\b/i,
  /\blength retention\b/i,
  /\bbreakage\b/i,
  /\bhairline\b/i,
  /\bedges\b/i,
  /\bshedding\b/i,
  /\bscalp condition\b/i,
  /\bdiagnos/i,
  /\bgoal\b/i,
  /\bchallenge\b/i,
  /\bprotein\b/i,
  /\bmoisture retention\b/i,
];

const any = (res: RegExp[], text: string) => res.some((re) => re.test(text));

/** A minus only counts against the score if it is a real conflict or a real harm. */
export function minusIsScoreWorthy(r: ScoreReason): boolean {
  const text = `${r.factor} ${r.reason}`;
  if (any(HARM_MARKERS, text)) return true;
  // RELEVANCE ≠ CONFLICT (2026-08-30). "Targets ageing and shedding rather than
  // her breakage concern" matched CONFLICT_MECHANISM only because the word
  // "breakage" appears in both lists, so a purpose mismatch capped a
  // well-formulated product at 55. Relevance framing with no harm marker is
  // never score-worthy — it becomes a Strand Tip instead.
  if (isRelevanceFraming(text)) return false;
  return any(CONFLICT_MECHANISM, text) && any(PROFILE_SIGNAL, text);
}


const stripCautionVoice = (s: string) =>
  s
    .replace(/\b(?:avoid|caution|beware|watch out|warning)\b[:,]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export interface FitFirstResult {
  reasons: ScoreReason[];
  strandTips: StrandTipNote[];
  score: number | null;
}

/**
 * Deterministic enforcement of the rule above. Mild minuses are MOVED to the
 * Strand Tip rather than dropped, so nothing informative is lost — it just
 * stops costing points and stops being presented as score rationale.
 */
export function applyFitFirst(
  score: number | null | undefined,
  reasons: ScoreReason[],
  modelTips: StrandTipNote[],
): FitFirstResult {
  const kept: ScoreReason[] = [];
  const moved: StrandTipNote[] = [];
  for (const r of reasons) {
    if (r.direction === "plus" || minusIsScoreWorthy(r)) {
      kept.push(r);
      continue;
    }
    moved.push({ title: stripCautionVoice(r.factor), note: stripCautionVoice(r.reason) });
  }

  // Lead with the fit: the strongest plus goes first.
  const plus = kept.filter((r) => r.direction === "plus");
  const minus = kept.filter((r) => r.direction === "minus");
  const ordered = [...plus, ...minus];

  let out = typeof score === "number" && Number.isFinite(score) ? score : null;
  if (out != null) {
    if (minus.length === 0) {
      // Nothing genuinely conflicts or harms — the score may not read as a
      // caution. Floor it at a level that matches "good fit, no real downside".
      const floor = plus.length >= 2 ? 80 : 70;
      if (out < floor) out = floor;
    } else if (plus.length === 0 && out > 55) {
      out = 55;
    }
  }

  const tips = [...modelTips, ...moved]
    .filter((t) => t.title && t.note)
    .slice(0, 3);

  return { reasons: ordered, strandTips: tips, score: out };
}

/** Narrows model output into the strict Strand Tip shape. */
export function sanitiseStrandTips(value: unknown): StrandTipNote[] {
  if (!Array.isArray(value)) return [];
  const out: StrandTipNote[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? stripCautionVoice(row.title) : "";
    const note = typeof row.note === "string" ? stripCautionVoice(row.note) : "";
    if (!title || !note) continue;
    out.push({ title, note });
    if (out.length === 2) break;
  }
  return out;
}
