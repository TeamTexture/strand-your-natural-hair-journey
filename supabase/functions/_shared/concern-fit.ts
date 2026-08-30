// AREAS OF CONCERN ARE A FIRST-CLASS SCORING INPUT (2026-08-30)
// =============================================================
// The member records the physical AREAS she is worried about
// (`user_hair_profile.areas_of_concern` → aiContext.hairProfile.areas_of_concern):
// edges, hairline, temples, crown, nape, parting, overall thinning.
//
// A formula whose mechanism is root anchoring, shedding reduction, density
// support or scalp condition is EXACTLY what those areas need. The engine was
// reading that as "targets something other than her stated challenge" and
// LOWERING the score for the very property that makes the product relevant
// (K18 biomimetic serum, scored 52 for a member whose recorded concern is
// edges / hairline).
//
// This module is deterministic and shared, so every analysis surface treats a
// concern the same way:
//   1. a "minus" row whose mechanism serves a recorded concern is never a
//      conflict — it is reframed as the plus it actually is,
//   2. an ingredient card flagged warn/avoid purely for that mechanism is
//      re-flagged "good" (declared sensitivities are untouched),
//   3. the score floor reflects the fit once a concern is genuinely served.
//
// It never invents an ingredient, a mechanism or a benefit: the reframed row
// reuses the model's own `factor` and states only the mechanism family that
// matched plus the area she recorded.

import type { ScoreReason } from "./score-reasons.ts";

/** Prompt block. Appended to the shared analysis failsafe rules, so it reaches
 *  every analysis surface at once. */
export const CONCERN_FIT_RULES = `AREAS OF CONCERN — SCORE THEM AS GOALS, NEVER AS A MISMATCH:
hairProfile.areas_of_concern lists the physical areas the member has recorded (edges, hairline, temples, crown, nape, parting, overall thinning). Weight them as strongly as her written goal and challenge.
- A formula that works on ROOT ANCHORING, SHEDDING, DENSITY, REGROWTH SUPPORT, FOLLICLE-LEVEL or SCALP CONDITION is directly relevant to a recorded concern at the edges, hairline, temples, crown or nape. Score that as a PLUS. It is NEVER a mismatch, never a minus, and never "targets something other than her concern".
- Never write a reason of the form "targets X rather than / not her Y" when X serves a recorded area of concern.
- key_ingredients flags follow the same rule: an ingredient whose mechanism supports a recorded concern is flagged "good", not "warn" and never "avoid". Only a DECLARED sensitivity/allergy or a genuine safety issue may be flagged "avoid".
- BALANCE: score_reasons must contain at least one "plus" whenever anything in the formula supports her recorded profile, goal or areas of concern. A list of only minuses for a well-formulated product is a failed answer.`;

/** Recorded areas that are served by root/density/shedding mechanisms. */
const AREA_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "edges", re: /\bedges?\b/i },
  { label: "hairline", re: /\bhair ?line\b/i },
  { label: "temples", re: /\btemples?\b/i },
  { label: "crown", re: /\bcrown\b/i },
  { label: "nape", re: /\bnape\b/i },
  { label: "parting", re: /\bpartings?\b/i },
  { label: "thinning", re: /\bthinning\b|\bthin(?:ner)? areas?\b|\bsparse\b/i },
  { label: "shedding", re: /\bshedding\b|\bhair loss\b/i },
];

/** Mechanism families that genuinely serve those areas. */
const SUPPORT_MECHANISMS: Array<{ label: string; re: RegExp }> = [
  { label: "root anchoring", re: /\broot(?:s)?\b|\banchor(?:age|ing|s)?\b/i },
  { label: "follicle-level support", re: /\bfollicl/i },
  { label: "shedding", re: /\bshed(?:ding)?\b|\bhair loss\b/i },
  { label: "density support", re: /\bdensity\b|\bregrowth\b|\bthinning\b|\bfullness\b/i },
  { label: "scalp condition", re: /\bscalp (?:health|condition|barrier|microbiome)\b/i },
  { label: "hair longevity", re: /\bageing\b|\baging\b|\blongevity\b|\bpremature\b/i },
];

const HARM_MARKERS = [
  /\bsensitivit/i,
  /\ballerg/i,
  /\bintoleran/i,
  /\bdeclared\b/i,
  /\bavoid completely\b/i,
  /\bunsafe\b/i,
  /\birritat/i,
  /\bburn/i,
];

const has = (res: RegExp[] | Array<{ re: RegExp }>, text: string) =>
  (res as Array<RegExp | { re: RegExp }>).some((r) =>
    r instanceof RegExp ? r.test(text) : r.re.test(text)
  );

/** Normalises the recorded areas into readable labels. Empty = no concerns. */
export function parseConcerns(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((v) => String(v ?? ""))
    : typeof value === "string"
      ? [value]
      : [];
  const text = raw.join(" ").replace(/_/g, " ");
  const out = AREA_PATTERNS.filter((a) => a.re.test(text)).map((a) => a.label);
  return [...new Set(out)];
}

/** The mechanism family in this text that serves one of her concerns, if any. */
export function concernMechanism(text: string, concerns: string[]): string | null {
  if (concerns.length === 0) return null;
  if (has(HARM_MARKERS, text)) return null;
  const hit = SUPPORT_MECHANISMS.find((m) => m.re.test(text));
  return hit ? hit.label : null;
}

const areaPhrase = (concerns: string[]): string => {
  const named = concerns.filter((c) => c !== "shedding" && c !== "thinning");
  const list = (named.length ? named : concerns).slice(0, 2);
  if (list.length === 0) return "your recorded areas of concern";
  if (list.length === 1) return `your ${list[0]}`;
  return `your ${list[0]} and ${list[1]}`;
};

export interface ConcernFitInput {
  score: number | null;
  reasons: ScoreReason[];
  /** key_ingredients (`flag`) or ingredient cards (`tone`). Returned adjusted. */
  cards?: unknown;
  concerns: string[];
}

export interface ConcernFitResult {
  score: number | null;
  reasons: ScoreReason[];
  cards: unknown;
  /** How many rows/cards were corrected — logged, never shown. */
  reframed: number;
  reflagged: number;
}

/**
 * Deterministic correction. Runs AFTER fit-first scoring, so anything already
 * moved to the Strand Tip stays there and only genuine score rows are touched.
 */
export function applyConcernFit(input: ConcernFitInput): ConcernFitResult {
  const concerns = input.concerns;
  if (concerns.length === 0) {
    return {
      score: input.score ?? null,
      reasons: input.reasons,
      cards: input.cards,
      reframed: 0,
      reflagged: 0,
    };
  }

  let reframed = 0;
  const reasons = input.reasons.map((r) => {
    if (r.direction === "plus") return r;
    const mechanism = concernMechanism(`${r.factor} ${r.reason}`, concerns);
    if (!mechanism) return r;
    reframed += 1;
    return {
      direction: "plus" as const,
      factor: r.factor,
      reason:
        `Works on ${mechanism}, which is directly relevant to the concern you recorded at ${areaPhrase(concerns)}.`,
    };
  });

  // Lead with the fit: pluses first, strongest driver at the top.
  const ordered = [
    ...reasons.filter((r) => r.direction === "plus"),
    ...reasons.filter((r) => r.direction === "minus"),
  ];

  let reflagged = 0;
  let cards = input.cards;
  if (Array.isArray(input.cards)) {
    cards = input.cards.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const row = { ...(raw as Record<string, unknown>) };
      const text = [row.name, row.benefit, row.reason, row.body]
        .filter((v) => typeof v === "string")
        .join(" ");
      if (!concernMechanism(text, concerns)) return raw;
      if (row.flag === "warn" || row.flag === "avoid") {
        row.flag = "good";
        reflagged += 1;
      }
      if (row.tone === "neutral" || row.tone === "bad") {
        row.tone = "good";
        reflagged += 1;
      }
      return row;
    });
  }

  let score = input.score ?? null;
  const plus = ordered.filter((r) => r.direction === "plus").length;
  const minus = ordered.length - plus;
  if (score != null && reframed > 0 && minus === 0) {
    const floor = plus >= 2 ? 85 : 80;
    if (score < floor) score = floor;
  }

  return { score, reasons: ordered, cards, reframed, reflagged };
}
