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
  if (typeof payload.match_score === "number") {
    (payload as Record<string, unknown>).match_score = applySensitivityCeiling(
      payload.match_score as number,
      labels.length,
    );
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
