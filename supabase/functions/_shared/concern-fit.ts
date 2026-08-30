// AREAS OF CONCERN + CHALLENGES ARE FIRST-CLASS SCORING INPUTS
// ============================================================
// The member records two separate signals that sit alongside her written goal:
//   • `user_hair_profile.areas_of_concern` — the physical AREAS she is worried
//     about (edges, hairline, temples, crown, nape, parting, overall thinning),
//   • `user_goals.challenges` — what her hair is actually DOING (Breakage,
//     Dryness, Shedding, Build-up, Frizz, Heat damage, …).
// A member can hold both (challenge "Breakage" AND concern "Edges / hairline")
// and neither cancels the other out: a correct analysis addresses both.
//
// A formula whose mechanism is root anchoring, shedding reduction, density
// support or scalp condition is EXACTLY what those areas need. The engine was
// reading that as "targets something other than her stated challenge" and
// LOWERING the score for the very property that makes the product relevant.
//
// This module is deterministic and shared, so every analysis surface treats a
// concern the same way:
//   1. a "minus" row whose mechanism serves a recorded concern is never a
//      conflict — it is reframed as the plus it actually is,
//   2. an ingredient card flagged warn/avoid purely for that mechanism is
//      re-flagged "good" (declared sensitivities are untouched),
//   3. the concern contribution to the score is PROPORTIONAL (2026-08-30) —
//      see `concernContribution` below. The old flat 80/85 floor lifted any
//      product that merely mentioned "root" or "density" to a good-fit score.
//
// It never invents an ingredient, a mechanism or a benefit: the reframed row
// reuses the model's own `factor` and states only the mechanism family that
// matched plus the area she recorded.

import type { ScoreReason } from "./score-reasons.ts";

/** Prompt block. Appended to the shared analysis failsafe rules, so it reaches
 *  every analysis surface at once. */
export const CONCERN_FIT_RULES = `AREAS OF CONCERN AND RECORDED CHALLENGES — SCORE THEM AS GOALS, NEVER AS A MISMATCH:
hairProfile.areas_of_concern lists the physical areas the member has recorded (edges, hairline, temples, crown, nape, parting, overall thinning). challenges lists what her hair is doing (Breakage, Dryness, Shedding, Build-up, Frizz, Heat damage). Weight BOTH as strongly as her written goal, and address both when she holds both — one never cancels the other.
- A formula that works on ROOT ANCHORING, SHEDDING, DENSITY, REGROWTH SUPPORT, FOLLICLE-LEVEL or SCALP CONDITION is directly relevant to a recorded concern at the edges, hairline, temples, crown or nape. Score that as a PLUS. It is NEVER a mismatch, never a minus, and never "targets something other than her concern".
- Never write a reason of the form "targets X rather than / not her Y" when X serves a recorded area of concern or a recorded challenge.
- key_ingredients flags follow the same rule: an ingredient whose mechanism supports a recorded concern is flagged "good", not "warn" and never "avoid". Only a DECLARED sensitivity/allergy or a genuine safety issue may be flagged "avoid".
- BALANCE: score_reasons must contain at least one "plus" whenever anything in the formula supports her recorded profile, goal, challenges or areas of concern. A list of only minuses for a well-formulated product is a failed answer.
- PROPORTION: how much the concern lifts the score depends on how CENTRAL the matching mechanism is to the formula. A headline active built around it earns far more than one concern-adjacent trace component. Say which it is.`;

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

/**
 * CHALLENGES (2026-08-30). Each recorded challenge and the mechanism families
 * that genuinely serve it. Used for the proportional score contribution and to
 * stop a challenge-serving property reading as a mismatch.
 */
const CHALLENGE_MECHANISMS: Array<{ label: string; challenge: RegExp; mechanism: RegExp }> = [
  {
    label: "breakage",
    challenge: /\bbreak(?:age|ing)\b|\bsnapping\b|\bfragil/i,
    mechanism:
      /\bprotein\b|\bpeptide\b|\bkeratin\b|\bamino acid\b|\bcystein/i,
  },
  {
    label: "breakage",
    challenge: /\bbreak(?:age|ing)\b|\bsnapping\b|\bfragil/i,
    mechanism: /\belasticity\b|\bbond\b|\bdisulfide\b|\bstrength\b|\bslip\b|\bfriction\b/i,
  },
  {
    label: "dryness",
    challenge: /\bdry(?:ness)?\b|\bmoisture\b/i,
    mechanism:
      /\bhumectant\b|\bemollient\b|\bocclusive\b|\bseals? (?:in|moisture)\b|\bslows? (?:water|moisture) loss\b|\bmoisture retention\b/i,
  },
  {
    label: "shedding",
    challenge: /\bshed(?:ding)?\b|\bhair loss\b|\bthinning\b/i,
    mechanism: /\broot\b|\banchor/i,
  },
  {
    label: "build-up",
    challenge: /\bbuild-?up\b|\bresidue\b/i,
    mechanism: /\bsurfactant\b|\bcleanse|\bchelat|\bclarif/i,
  },
  {
    label: "frizz",
    challenge: /\bfrizz\b/i,
    mechanism: /\bcuticle\b|\bcoats?\b|\bsmooth/i,
  },
  {
    label: "heat damage",
    challenge: /\bheat\b/i,
    mechanism: /\bheat\b|\bthermal\b|\bprotein\b|\bbond\b/i,
  },
  {
    label: "scalp",
    challenge: /\bscalp\b|\bitch|\bflak|\bdandruff\b/i,
    mechanism: /\bscalp\b|\bsebum\b|\bflaking\b|\birritation\b|\banti-?fungal\b/i,
  },
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

/** Normalises `user_goals.challenges` into plain lowercase labels. */
export function parseChallenges(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((v) => String(v ?? ""))
    : typeof value === "string"
      ? [value]
      : [];
  return [...new Set(
    raw
      .map((v) => v.replace(/_/g, " ").trim().toLowerCase())
      .filter((v) => v.length > 1),
  )].slice(0, 8);
}

/** The mechanism family in this text that serves one of her concerns, if any. */
export function concernMechanism(text: string, concerns: string[]): string | null {
  if (concerns.length === 0) return null;
  if (has(HARM_MARKERS, text)) return null;
  const hit = SUPPORT_MECHANISMS.find((m) => m.re.test(text));
  return hit ? hit.label : null;
}

/** The recorded challenge this text serves, if any. */
export function challengeMechanism(text: string, challenges: string[]): string | null {
  if (challenges.length === 0) return null;
  if (has(HARM_MARKERS, text)) return null;
  for (const row of CHALLENGE_MECHANISMS) {
    if (!challenges.some((c) => row.challenge.test(c))) continue;
    if (row.mechanism.test(text)) return row.label;
  }
  return null;
}

const areaPhrase = (concerns: string[]): string => {
  const named = concerns.filter((c) => c !== "shedding" && c !== "thinning");
  const list = (named.length ? named : concerns).slice(0, 2);
  if (list.length === 0) return "your recorded areas of concern";
  if (list.length === 1) return `your ${list[0]}`;
  return `your ${list[0]} and ${list[1]}`;
};

/** Support-cast ingredient classes: real, useful, but never the reason a
 *  formula suits a recorded concern. */
const SUPPORT_CAST =
  /\bwater\b|\baqua\b|\bglycerin\b|\bpreservative\b|\bsodium benzoate\b|\bpotassium sorbate\b|\bphenoxyethanol\b|\bcitric acid\b|\bsodium hydroxide\b|\bphosphate\b|\bpolysorbate\b|\bpeg-\d+\b|\bxanthan\b|\bcellulose\b|\bcarbomer\b|\bfragrance\b|\bparfum\b|\bmica\b|\bph adjust|\bbuffer|\bemulsifier\b|\bthickener\b|\bsolvent\b|\bglycol\b/i;

/** Headline functional actives — the molecules a formula is built around. */
const HEADLINE_ACTIVE =
  /\bpeptide\b|\bdipeptide\b|\btripeptide\b|\btetrapeptide\b|\bcysteinate\b|\bcysteine\b|\bkeratin\b|\bhydroly[sz]ed\b|\bceramide\b|\bniacinamide\b|\bpanthenol\b|\bcaffeine\b|\bbiotin\b|\bzinc\b|\bamino acid\b|\bprotein\b|\bbond\b/i;

export interface ConcernFitInput {
  score: number | null;
  reasons: ScoreReason[];
  /** key_ingredients (`flag`) or ingredient cards (`tone`). Returned adjusted. */
  cards?: unknown;
  concerns: string[];
  /** `user_goals.challenges` — always supplied (2026-08-30 standing rule). */
  challenges?: string[];
  /** The product's INCI list, used to judge how central the match is. */
  ingredients?: string[];
}

export interface ConcernFitResult {
  score: number | null;
  reasons: ScoreReason[];
  cards: unknown;
  /** How many rows/cards were corrected — logged, never shown. */
  reframed: number;
  reflagged: number;
  /** The proportional maths, for the logs. */
  contribution: ConcernContribution;
}

export interface ConcernContribution {
  /** 0 → nothing matched, 1 → a headline active the reasons already name. */
  centrality: number;
  /** Share of her recorded signals (concerns + challenges) the formula serves. */
  breadth: number;
  supportivePluses: number;
  conflicts: number;
  bonus: number;
}

/**
 * PROPORTIONAL CONCERN CONTRIBUTION (2026-08-30) — replaces the flat 80/85
 * floor. Deterministic, and explained in CLAUDE.md:
 *
 *   centrality  1.0  a concern/challenge-serving HEADLINE active that the
 *                    score reasons already name by name
 *               0.7  a headline active present in the formula, unnamed
 *               0.4  only support-cast / trace components carry the mechanism
 *               0    nothing in the formula serves a recorded signal
 *   breadth     served signals ÷ recorded signals (concerns + challenges),
 *               applied as (0.5 + 0.5 × breadth) so serving one of four still
 *               counts, but serving all four counts double
 *   bonus       round(20 × centrality × breadthMultiplier)
 *                 + 3 × min(other supportive pluses, 2)
 *                 − 6 × genuine conflicts
 *               clamped to 0…22
 *   final       min(95, base + bonus), never below base
 */
export function concernContribution(input: {
  reasons: ScoreReason[];
  cards?: unknown;
  ingredients?: string[];
  concerns: string[];
  challenges: string[];
  conflicts: number;
}): ConcernContribution {
  const { concerns, challenges } = input;
  const recorded = concerns.length + challenges.length;
  if (recorded === 0) {
    return { centrality: 0, breadth: 0, supportivePluses: 0, conflicts: input.conflicts, bonus: 0 };
  }

  const cards = Array.isArray(input.cards) ? input.cards : [];
  const cardText = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return { name: "", text: "" };
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const text = [row.body, row.benefit, row.reason]
      .filter((v) => typeof v === "string")
      .join(" ");
    return { name, text };
  };

  const servedLabels = new Set<string>();
  let headlineMatch = false;
  let supportMatch = false;
  const matchedNames: string[] = [];

  const consider = (name: string, text: string) => {
    const hay = `${name} ${text}`;
    const c = concernMechanism(hay, concerns);
    const ch = challengeMechanism(hay, challenges);
    if (!c && !ch) return;
    if (c) servedLabels.add(`concern:${c}`);
    if (ch) servedLabels.add(`challenge:${ch}`);
    const isHeadline = HEADLINE_ACTIVE.test(name) && !SUPPORT_CAST.test(name);
    if (isHeadline) {
      headlineMatch = true;
      matchedNames.push(name.toLowerCase());
    } else if (SUPPORT_CAST.test(name) || !name) {
      supportMatch = true;
    } else {
      // A real functional ingredient that is not a support-cast component.
      headlineMatch = headlineMatch || false;
      supportMatch = true;
      matchedNames.push(name.toLowerCase());
    }
  };

  for (const raw of cards) {
    const { name, text } = cardText(raw);
    consider(name, text);
  }
  // The INCI list alone can carry a headline active even when the card copy is
  // thin — but it only ever earns the "present, unnamed" tier.
  for (const ing of input.ingredients ?? []) {
    const name = String(ing ?? "");
    if (!name || SUPPORT_CAST.test(name)) continue;
    if (!HEADLINE_ACTIVE.test(name)) continue;
    // Only counts when the member's own signals could be served by it.
    if (challenges.length || concerns.length) {
      headlineMatch = true;
      matchedNames.push(name.toLowerCase());
    }
  }

  // Do the score reasons actually name one of the matching ingredients?
  const reasonText = input.reasons
    .map((r) => `${r.factor} ${r.reason}`.toLowerCase())
    .join(" | ");
  const named = matchedNames.some((n) => n && reasonText.includes(n.split(/\s+/)[0]));

  let centrality = 0;
  if (headlineMatch) centrality = named ? 1 : 0.7;
  else if (supportMatch) centrality = 0.4;
  if (centrality === 0) {
    return { centrality: 0, breadth: 0, supportivePluses: 0, conflicts: input.conflicts, bonus: 0 };
  }

  const breadth = Math.min(1, servedLabels.size / Math.max(1, recorded));
  const breadthMultiplier = 0.5 + 0.5 * breadth;

  // Pluses that are NOT the concern/challenge story — general formula quality.
  const supportivePluses = input.reasons.filter((r) => {
    if (r.direction !== "plus") return false;
    const hay = `${r.factor} ${r.reason}`;
    return !concernMechanism(hay, concerns) && !challengeMechanism(hay, challenges);
  }).length;

  const raw =
    Math.round(30 * centrality * breadthMultiplier) +
    3 * Math.min(supportivePluses, 2) -
    6 * input.conflicts;

  return {
    centrality,
    breadth,
    supportivePluses,
    conflicts: input.conflicts,
    bonus: Math.max(0, Math.min(30, raw)),
  };
}

/**
 * Deterministic correction. Runs AFTER fit-first scoring, so anything already
 * moved to the Strand Tip stays there and only genuine score rows are touched.
 */
export function applyConcernFit(input: ConcernFitInput): ConcernFitResult {
  const concerns = input.concerns;
  const challenges = input.challenges ?? [];
  const empty: ConcernContribution = {
    centrality: 0,
    breadth: 0,
    supportivePluses: 0,
    conflicts: 0,
    bonus: 0,
  };
  if (concerns.length === 0 && challenges.length === 0) {
    return {
      score: input.score ?? null,
      reasons: input.reasons,
      cards: input.cards,
      reframed: 0,
      reflagged: 0,
      contribution: empty,
    };
  }

  let reframed = 0;
  const reasons = input.reasons.map((r) => {
    if (r.direction === "plus") return r;
    const hay = `${r.factor} ${r.reason}`;
    const mechanism = concernMechanism(hay, concerns);
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
      const serves = concernMechanism(text, concerns) ||
        challengeMechanism(text, challenges);
      if (!serves) return raw;
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

  // PROPORTIONAL, not a flat floor. The concern/challenge fit earns a bonus
  // sized by how central the matching mechanism is to this formula.
  const conflicts = ordered.filter((r) => r.direction === "minus").length;
  const contribution = concernContribution({
    reasons: ordered,
    cards,
    ingredients: input.ingredients,
    concerns,
    challenges,
    conflicts,
  });

  let score = input.score ?? null;
  if (score != null && contribution.bonus > 0) {
    score = Math.min(95, Math.max(score, score + contribution.bonus));
  }

  return { score, reasons: ordered, cards, reframed, reflagged, contribution };
}
