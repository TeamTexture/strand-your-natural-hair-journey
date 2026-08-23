// Topical (skin/scalp) sensitivity enforcement for the product surfaces.
//
// Nutrition treats a dietary allergen as a CONTENT FILTER — regenerate the
// plan without it. Product analysis cannot do that: a product's INCI list is
// what it is. So here the same loaded data drives a WARNING system instead:
// the member's declared topical avoids are named in the prompt, and every
// payload is scanned deterministically afterwards so the warning surfaces
// even when the model misses it.
//
// Nothing decrypted is ever logged — only counts and the member's own labels
// travel into their own payload.

import {
  validateAgainstAvoid,
  type LoadedSensitivities,
} from "./sensitivities.ts";
import type { ScoreReason } from "./score-reasons.ts";
import { applySensitivityCeiling } from "./sensitivity-ceiling.ts";

/** Prompt block: name the exclusions, but as a warning contract. */
export function topicalSensitivityBlock(s: LoadedSensitivities): string {
  if (s.all.length === 0) return "";
  const lines: string[] = [];
  if (s.avoid.length > 0) {
    lines.push(
      `HARD EXCLUSIONS — these are allergies or true skin/scalp sensitivities this member has declared. They must NEVER appear, in any form, under any name, including derivatives, INCI synonyms and hidden sources, in anything you RECOMMEND: ${
        s.avoid.map((e) => e.label).join("; ")
      }.`,
      `If one of them is present in THIS product's ingredient list, do NOT hide it, omit it from ingredients[], or soften it: name it explicitly, mark that ingredient's flag "avoid" (tone "bad"), say in its reason that the member has flagged it as a sensitivity, and let the match score fall accordingly.`,
    );
  }
  if (s.limit.length > 0) {
    lines.push(
      `LIMIT — tolerated in small amounts only. Note it plainly where it appears, never as a headline benefit: ${
        s.limit.map((e) => e.label).join("; ")
      }.`,
    );
  }
  if (s.dislike.length > 0) {
    lines.push(
      `DISLIKES — safe, simply not wanted. Prefer alternatives where there is a choice: ${
        s.dislike.map((e) => e.label).join("; ")
      }.`,
    );
  }
  lines.push(
    "Never tell the member a product is allergen-free or safe for them — always leave the label check with them.",
  );
  return `\n\nALLERGY AND SENSITIVITY CONSTRAINTS (BINDING — TOPICAL)\n${lines.join("\n")}`;
}

export interface TopicalHitSummary {
  labels: string[];
  /** Lowercased matched term per label, for reason copy. */
  terms: Record<string, string>;
}

/** Deterministic scan of the strings a payload exposes to the member. */
export function scanTopical(
  strings: (string | null | undefined)[],
  s: LoadedSensitivities,
): TopicalHitSummary {
  const hits = validateAgainstAvoid(
    strings.filter((x): x is string => typeof x === "string" && x.length > 0),
    s,
    "topical",
  );
  const terms: Record<string, string> = {};
  for (const h of hits) if (!terms[h.label]) terms[h.label] = h.term;
  return { labels: Object.keys(terms), terms };
}

/** True when this single ingredient name matches a hard topical exclusion. */
export function matchIngredient(
  name: string,
  s: LoadedSensitivities,
): { label: string; term: string } | null {
  const hits = validateAgainstAvoid([name], s, "topical");
  return hits.length > 0 ? { label: hits[0].label, term: hits[0].term } : null;
}

const SENSITIVITY_SENTENCE = (labels: string[]) =>
  `Contains ${labels.join(" and ")}, which you've flagged as a sensitivity — read the pack before you use it.`;

/**
 * Score ceiling once declared hard sensitivities are present in the formula.
 * GRADUATED by matched count (1 → 18, 2 → 8, 3+ → 3) via the shared curve in
 * ./sensitivity-ceiling.ts, mirrored client-side in src/lib/sensitivityCeiling.ts.
 * More matched allergens = a worse product for this member = a lower number.
 */
export { applySensitivityCeiling, sensitivityCeiling } from "./sensitivity-ceiling.ts";

export function sensitivityScoreReason(label: string, term: string): ScoreReason {
  return {
    direction: "minus",
    factor: term.slice(0, 60),
    reason: `You've flagged ${label} as a sensitivity and it appears in this formula.`,
  };
}

/**
 * Annotate a product-analysis-shaped payload in place-ish (returns the same
 * object) with the member's topical sensitivity warnings. Warning only — the
 * ingredient list is never edited and nothing is regenerated.
 */
export function annotateProductSensitivities<T extends Record<string, unknown>>(
  payload: T,
  s: LoadedSensitivities,
  fnName: string,
): T {
  if (!payload || s.avoid.length === 0) return payload;

  const keyIngredients = Array.isArray(payload.key_ingredients)
    ? (payload.key_ingredients as Array<Record<string, unknown>>)
    : [];
  const ingredients = Array.isArray(payload.ingredients)
    ? (payload.ingredients as unknown[]).map(String)
    : [];
  const useCases = Array.isArray(payload.use_cases)
    ? (payload.use_cases as unknown[]).map(String)
    : [];
  const tips = Array.isArray(payload.tips)
    ? (payload.tips as unknown[]).map(String)
    : [];

  const { labels, terms } = scanTopical(
    [
      ...ingredients,
      ...keyIngredients.map((k) => String(k.name ?? "")),
      typeof payload.ai_summary === "string" ? payload.ai_summary : "",
      ...useCases,
      ...tips,
    ],
    s,
  );
  if (labels.length === 0) return payload;

  // 1. Force the matching key_ingredients to "avoid" and name the reason.
  for (const k of keyIngredients) {
    const hit = matchIngredient(String(k.name ?? ""), s);
    if (!hit) continue;
    k.flag = "avoid";
    k.sensitivity = true;
    const existing = typeof k.reason === "string" ? k.reason : "";
    if (!/sensitivit/i.test(existing)) {
      k.reason = `You've flagged ${hit.label} as a sensitivity. ${existing}`.trim();
    }
  }

  // 2. Visible named warning in the summary.
  const summary = typeof payload.ai_summary === "string" ? payload.ai_summary : "";
  if (!/flagged as a sensitivity/i.test(summary)) {
    (payload as Record<string, unknown>).ai_summary = [
      summary.trim(),
      SENSITIVITY_SENTENCE(labels),
    ].filter(Boolean).join(" ");
  }

  // 3. Score reasons + honest score.
  const reasons = Array.isArray(payload.score_reasons)
    ? (payload.score_reasons as ScoreReason[])
    : [];
  for (const label of labels) {
    if (reasons.some((r) => r.reason?.includes(label))) continue;
    reasons.unshift(sensitivityScoreReason(label, terms[label] ?? label));
  }
  (payload as Record<string, unknown>).score_reasons = reasons.slice(0, 4);
  // NEVER overwrite match_score with the ceiling: the score is persisted to
  // user_products.ln and would stay capped forever after the member removes
  // the sensitivity. The ceiling is a DISPLAY rule, applied live client-side
  // (src/lib/sensitivityCeiling.ts) so it appears and disappears reactively.
  if (typeof payload.match_score === "number") {
    (payload as Record<string, unknown>)._sensitivity_ceiling =
      applySensitivityCeiling(payload.match_score as number, labels.length);
  }

  (payload as Record<string, unknown>)._sensitivity_flagged = labels;

  // Counts only — never the labels, never the payload.
  console.log(JSON.stringify({
    event: "topical_sensitivity_warning",
    fn: fnName,
    hits: labels.length,
  }));

  return payload;
}

/**
 * Enforce declared topical sensitivities on an ingredient-analysis payload
 * (the card-list shape used by `ingredient-analysis`) against the RAW stored
 * INCI list — never only the list the model chose to echo back.
 *
 * SAFETY: the model can reword, shorten or entirely omit an ingredient from
 * its own `ingredients[]` cards. Matching only against those cards let a
 * declared sulphate/fragrance sensitivity go unflagged on the product detail
 * page while the shelf card (which reads `user_products.ingredients`) flagged
 * it correctly. The raw list is the single source of truth for the match; a
 * raw hit the model failed to card gets a card synthesised for it so the
 * checklist can never stay silent about it.
 *
 * Warning system, not a filter: nothing is removed and nothing regenerated.
 * Returns the same object, annotated.
 */
export function enforceIngredientCardSensitivities<
  T extends { match_score?: number; summary?: string; score_reasons?: ScoreReason[]; ingredients?: unknown },
>(
  analysis: T,
  s: LoadedSensitivities,
  rawIngredients: string[],
  fnName: string,
): T {
  if (!analysis || s.avoid.length === 0) return analysis;

  const cards = Array.isArray(analysis.ingredients)
    ? (analysis.ingredients as Array<Record<string, unknown>>)
    : [];
  const raw = (rawIngredients ?? []).filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );

  const flagged: string[] = [];
  const terms: Record<string, string> = {};

  // 1. Cards the model DID return that match a declared exclusion.
  for (const card of cards) {
    const hit = matchIngredient(String(card?.name ?? ""), s);
    if (!hit) continue;
    card.tone = "bad";
    card.sensitivity = true;
    const body = typeof card.body === "string" ? card.body : "";
    if (!/sensitivit/i.test(body)) {
      card.body = `You've flagged ${hit.label} as a sensitivity. ${body}`.trim();
    }
    if (!flagged.includes(hit.label)) flagged.push(hit.label);
    if (!terms[hit.label]) terms[hit.label] = hit.term;
  }

  // 2. THE RAW LIST — the authoritative source. Anything matched here that the
  //    model never carded gets its own card so the checklist names it.
  for (const name of raw) {
    const hit = matchIngredient(name, s);
    if (!hit) continue;
    if (!terms[hit.label]) terms[hit.label] = hit.term;
    if (!flagged.includes(hit.label)) flagged.push(hit.label);
    const alreadyCarded = cards.some(
      (c) => String(c?.name ?? "").trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (alreadyCarded) continue;
    cards.unshift({
      name: name.trim().slice(0, 80),
      tone: "bad",
      sensitivity: true,
      category: "Declared sensitivity",
      body: `You've flagged ${hit.label} as a sensitivity and this ingredient is on this product's label.`,
    });
  }
  if (cards.length > 0) (analysis as Record<string, unknown>).ingredients = cards;

  // 3. Anything named in the prose the model wrote.
  const scanned = scanTopical(
    cards.map((c) => `${c?.name ?? ""} ${c?.body ?? ""}`),
    s,
  );
  for (const label of scanned.labels) {
    if (!flagged.includes(label)) flagged.push(label);
    if (!terms[label]) terms[label] = scanned.terms[label] ?? label;
  }

  if (flagged.length === 0) return analysis;

  const reasons = Array.isArray(analysis.score_reasons) ? analysis.score_reasons : [];
  for (const label of flagged) {
    if (reasons.some((r) => r.reason?.includes(label))) continue;
    reasons.unshift(sensitivityScoreReason(label, terms[label] ?? label));
  }
  (analysis as Record<string, unknown>).score_reasons = reasons.slice(0, 4);

  // Display-only ceiling — see note above; the stored score stays raw.
  if (typeof analysis.match_score === "number") {
    (analysis as Record<string, unknown>)._sensitivity_ceiling =
      applySensitivityCeiling(analysis.match_score, flagged.length) ?? analysis.match_score;
  }
  const summary = typeof analysis.summary === "string" ? analysis.summary : "";
  if (!/flagged as a sensitivity/i.test(summary)) {
    (analysis as Record<string, unknown>).summary = [summary.trim(), SENSITIVITY_SENTENCE(flagged)]
      .filter(Boolean)
      .join(" ");
  }
  (analysis as Record<string, unknown>)._sensitivity_flagged = flagged;

  // Counts only — never the labels, never the payload.
  console.log(JSON.stringify({
    event: "topical_sensitivity_warning",
    fn: fnName,
    hits: flagged.length,
  }));

  return analysis;
}
