// ONE ENTRY POINT FOR THE ANALYSIS FAILSAFES
// ==========================================
// 2026-08-28. The fit-first work (closed vocabulary, ingredient-name lockdown,
// nullability, fit-first scoring, Strand Tip) originally shipped inside the
// `ingredient-analysis` directory, so only that function got it — every other
// analysis surface kept generating caution-first copy from its own prompt and
// its own MODEL_VERSION cache key. Members read `product-analyse`, so members
// never saw the fix.
//
// Structural remedy: the modules live in `_shared` (which every function
// bundles from — the same folder as citation-log.ts, score-reasons.ts and the
// rest of the grounding stack), and every analysis function routes its
// post-generation checks through the SINGLE function below. Adding a new
// analysis function without wiring it up fails the test in
// `src/test/analysis_failsafes.test.ts`, which enumerates the list here.

import type { ScoreReason } from "./score-reasons.ts";
// The vocabulary + name-lock + usage-grounding checks live in ONE module
// (`content-integrity.ts`) shared by every member-facing generation, analysis
// or not. This file keeps the analysis-specific extras on top: fit-first
// scoring and the Strand Tip split.
import { checkContentIntegrity, type IntegrityCheck } from "./content-integrity.ts";
import type { UsageDirections } from "./usage-grounding.ts";
import { applyFitFirst, sanitiseStrandTips, type StrandTipNote } from "./fit-first-score.ts";

/**
 * THE enumeration. Every function named here must route its generated payload
 * through `enforceAnalysisFailsafes` and carry the fit-first model tag.
 * `score: false` marks a guidance-only surface: vocabulary + name lock +
 * nullability still apply, fit-first scoring does not (there is no score).
 */
export const FAILSAFE_ANALYSIS_FUNCTIONS: ReadonlyArray<{ name: string; score: boolean }> = [
  { name: "ingredient-analysis", score: true },
  { name: "product-analyse", score: true },
  { name: "product-analyse-url", score: true },
  { name: "tool-analyse-url", score: true },
  { name: "ingredient-profile", score: false },
  { name: "brand-product-guidance", score: false },
];

/** The single fit-first cache tag. Every mirrored function's MODEL_VERSION ends with it. */
export const FIT_FIRST_TAG = "v15-fit-first-2026-08-28";

export interface FailsafeInput {
  /** Prose fields to validate: `{ field: "summary", text: … }`. */
  fields: Array<{ field: string; text: unknown }>;
  /** Per-ingredient cards, when the payload has them. */
  cards?: unknown;
  /** The product's stored ingredient list — the only legal ingredient names. */
  allowedIngredients?: string[];
  /** Known ingredient names (glossary) used as the detection vocabulary. */
  vocabulary?: string[];
  /** Omit (or pass null) on guidance-only surfaces with no score. */
  score?: number | null;
  reasons?: ScoreReason[];
  /** Whatever the model returned in `strand_tip`. */
  modelTips?: unknown;
  /** Real manufacturer directions, when the surface has a product. Enables
   *  the technique-grounding check inside the shared integrity module. */
  directions?: UsageDirections | null;
  /** Rejection-log metadata, so failures are queryable in ai_content_rejections. */
  functionName?: string;
  userId?: string | null;
  subject?: string | null;
}

export interface FailsafeViolation {
  field: string;
  phrase: string;
  rule: string;
  /** Which shared integrity check produced this. */
  check?: IntegrityCheck;
}

export interface FailsafeResult {
  /** Retry instructions. Non-empty means REJECT this generation and re-ask. */
  problems: string[];
  /** The same failures, with the field path that produced them. */
  violations: FailsafeViolation[];
  reasons: ScoreReason[];
  strandTips: StrandTipNote[];
  score: number | null;
}

/**
 * Runs, in order: closed hair/scalp vocabulary validation, the ingredient-name
 * lockdown, then fit-first scoring (only when a score exists).
 */
export function enforceAnalysisFailsafes(input: FailsafeInput): FailsafeResult {
  const violations: FailsafeViolation[] = checkContentIntegrity({
    functionName: input.functionName ?? "analysis",
    userId: input.userId ?? null,
    subject: input.subject ?? null,
    fields: input.fields,
    cards: input.cards,
    allowedIngredients: input.allowedIngredients ?? [],
    ingredientVocabulary: input.vocabulary ?? [],
    directions: input.directions ?? null,
  }).violations;

  const hasScore = typeof input.score === "number" && Number.isFinite(input.score);
  const fit = applyFitFirst(
    hasScore ? (input.score as number) : null,
    input.reasons ?? [],
    sanitiseStrandTips(input.modelTips),
  );

  return {
    problems: [...new Set(violations.map((v) => v.rule))].slice(0, 8),
    violations,
    reasons: fit.reasons,
    strandTips: fit.strandTips,
    score: fit.score,
  };
}

/** Convenience: the prose fields every product-shaped payload exposes. */
export function productProseFields(payload: Record<string, unknown>): Array<{ field: string; text: unknown }> {
  const reasons = Array.isArray(payload.score_reasons) ? payload.score_reasons : [];
  const keys = Array.isArray(payload.key_ingredients) ? payload.key_ingredients : [];
  const cards = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  const tips = Array.isArray(payload.tips) ? payload.tips : [];
  const useCases = Array.isArray(payload.use_cases) ? payload.use_cases : [];
  return [
    { field: "ai_summary", text: payload.ai_summary ?? payload.summary },
    { field: "usage_instructions", text: payload.usage_instructions },
    { field: "routine_suggestion", text: payload.routine_suggestion },
    ...reasons.flatMap((r, i) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return [
        { field: `score_reasons[${i}].factor`, text: row.factor },
        { field: `score_reasons[${i}].reason`, text: row.reason },
      ];
    }),
    ...keys.flatMap((k, i) => {
      const row = (k ?? {}) as Record<string, unknown>;
      return [
        { field: `key_ingredients[${i}].benefit`, text: row.benefit },
        { field: `key_ingredients[${i}].reason`, text: row.reason },
      ];
    }),
    ...cards.flatMap((c, i) => {
      const row = (c ?? {}) as Record<string, unknown>;
      return typeof row.body === "string" ? [{ field: `ingredients[${i}].body`, text: row.body }] : [];
    }),
    ...tips.map((t, i) => ({ field: `tips[${i}]`, text: t })),
    ...useCases.map((u, i) => ({ field: `use_cases[${i}]`, text: u })),
  ];
}

/**
 * Nullability as the last resort. When a generation still carries an invented
 * term or an ingredient name that is not in the formula, the offending FIELD is
 * emptied rather than shown: every descriptive field in these schemas is
 * nullable, so "nothing" is always a valid answer and is always safer than
 * wrong. Array members addressed as `path[i].key` are removed entirely.
 */
export function applyFieldNulls(
  payload: Record<string, unknown>,
  violations: FailsafeViolation[],
): string[] {
  const cleared: string[] = [];
  const dropped = new Map<string, Set<number>>();
  for (const v of violations) {
    const m = v.field.match(/^([A-Za-z_]+)\[(\d+)\]/);
    if (m) {
      const set = dropped.get(m[1]) ?? new Set<number>();
      set.add(Number(m[2]));
      dropped.set(m[1], set);
      continue;
    }
    const key = v.field.split(/[.[]/)[0];
    if (key in payload) {
      payload[key] = null;
      cleared.push(key);
    }
  }
  for (const [key, idx] of dropped) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    payload[key] = arr.filter((_, i) => !idx.has(i));
    cleared.push(...[...idx].map((i) => `${key}[${i}]`));
  }
  return cleared;
}

/**
 * The detection vocabulary for the ingredient-name lockdown: STRAND's own
 * known ingredient names. Only names in here are searched for in prose, so
 * ordinary sentences are never falsely flagged. Best-effort — a failed read
 * degrades to "no prose detection", never to a blocked generation.
 */
export async function loadIngredientVocabulary(
  client: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => { limit: (n: number) => Promise<{ data: unknown }> };
      };
    };
  },
): Promise<string[]> {
  try {
    // MOLECULES ONLY (2026-08-28 regression). The glossary also holds concept
    // and class entries ("Porosity", "Density", "Peptides"). Searching for
    // those in prose made ordinary sentences look like they named an
    // ingredient that was not in the formula, which nulled ai_summary and
    // score_reasons and left the member with an empty verdict card.
    const { data } = await client
      .from("glossary_terms")
      .select("display_name")
      .eq("kind", "molecule")
      .limit(2000);
    return ((data ?? []) as Array<{ display_name?: string | null }>)
      .map((r) => (r.display_name ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
