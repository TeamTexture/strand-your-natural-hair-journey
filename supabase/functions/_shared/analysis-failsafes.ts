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
import { applyConcernFit, parseChallenges, parseConcerns, type ConcernContribution } from "./concern-fit.ts";
import { heroActiveOmissions, rankScoreReasons } from "./score-reasons.ts";
import { validateMechanismSpecificity } from "./mechanism-specificity.ts";
import { applyBenignFlagPolicy } from "./benign-flags.ts";
// TWO AXES (2026-09-01): quality/safety drives the number the UI reads;
// relevance gets its own sentence and never touches the score.
import { resolveScoreAxes } from "./relevance-axis.ts";

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
  /** The payload key those cards live under — defaults to `ingredients`.
   *  Product surfaces hold them in `key_ingredients` and MUST say so, or a
   *  card-name rejection nulls the verified ingredient list. */
  cardsField?: string;
  /** The product's stored ingredient list — the only legal ingredient names. */
  allowedIngredients?: string[];
  /** Known ingredient names (glossary) used as the detection vocabulary. */
  vocabulary?: string[];
  /** Omit (or pass null) on guidance-only surfaces with no score. */
  score?: number | null;
  /** The model's quality/safety axis (`quality_score`). When present it — not
   *  `score` — is the basis for `match_score`, so a purpose mismatch can never
   *  drag the rating down (see _shared/relevance-axis.ts). */
  qualityScore?: unknown;
  /** The model's `relevance_note`. Returned sanitised, or derived from a
   *  relevance-framed row when the model put it in the wrong field. */
  relevanceNote?: unknown;
  reasons?: ScoreReason[];
  /** Whatever the model returned in `strand_tip`. */
  modelTips?: unknown;
  /** Real manufacturer directions, when the surface has a product. Enables
   *  the technique-grounding check inside the shared integrity module. */
  directions?: UsageDirections | null;
  /** The member's recorded physical areas of concern (edges, hairline, crown,
   *  nape, thinning) — `aiContext.hairProfile.areas_of_concern`. A first-class
   *  scoring input: a root/density/shedding mechanism serving one of these is
   *  a plus, never a mismatch (see _shared/concern-fit.ts). */
  areasOfConcern?: unknown;
  /** `user_goals.challenges` — Breakage, Dryness, Shedding, … STANDING RULE
   *  (2026-08-30): every analysis surface passes this, always, weighted
   *  alongside the goal and the areas of concern. */
  challenges?: unknown;
  /** Declared topical sensitivities / documented allergies. Used only to keep
   *  a genuine caution flag: never to add one. */
  declaredSensitivities?: unknown;
  /** The member's documented avoid-ingredients list. */
  avoidIngredients?: unknown;
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
  /** The quality/safety axis as resolved — the basis for `score`. */
  qualityScore: number | null;
  /** One plain sentence when the formula's purpose differs from what she
   *  recorded. Rendered as its own row, never as score rationale. */
  relevanceNote: string | null;
  /** The ingredient cards, with concern-driven flags corrected. */
  cards: unknown;
  /** Counts of concern corrections applied — for logs, never member-facing. */
  concernCorrections: {
    reframed: number;
    reflagged: number;
    downgradedFlags: number;
    synthesisedPluses: number;
  };
  /** The proportional concern/challenge maths that moved the score. */
  concernContribution: ConcernContribution;
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
    cardsField: input.cardsField ?? "ingredients",
    allowedIngredients: input.allowedIngredients ?? [],
    ingredientVocabulary: input.vocabulary ?? [],
    directions: input.directions ?? null,
  }).violations;

  // Split the axes BEFORE any scoring runs, so the fit-first floors, the
  // concern lift, the stars and the fit band all work off the quality/safety
  // number and never off a relevance-contaminated one.
  const axes = resolveScoreAxes({
    matchScore: input.score,
    qualityScore: input.qualityScore,
    relevanceNote: input.relevanceNote,
    reasons: input.reasons ?? [],
    strandTips: sanitiseStrandTips(input.modelTips),
  });
  const hasScore = axes.score != null;
  const fit = applyFitFirst(
    hasScore ? (axes.score as number) : null,
    input.reasons ?? [],
    sanitiseStrandTips(input.modelTips),
  );

  // Areas of concern AND recorded challenges are scored as goals, not
  // mismatches, and the lift they earn is proportional to how central the
  // matching mechanism is to the formula (see _shared/concern-fit.ts).
  const concern = applyConcernFit({
    score: fit.score,
    reasons: fit.reasons,
    cards: input.cards,
    concerns: parseConcerns(input.areasOfConcern),
    challenges: parseChallenges(input.challenges),
    ingredients: input.allowedIngredients ?? [],
  });

  // Benign functional ingredients (preservatives, pH adjusters, colourants,
  // emulsifiers, fragrance) may not carry a caution flag on class grounds.
  const benign = applyBenignFlagPolicy({
    cards: concern.cards,
    declaredSensitivities: input.declaredSensitivities,
    avoidIngredients: input.avoidIngredients,
  });

  // Hero actives lead the verdict; the supporting cast never does.
  const ranked = rankScoreReasons(concern.reasons);

  // RETRY-ONLY problems: they never null a field, they re-ask for substance.
  const substanceProblems = [
    ...validateMechanismSpecificity(benign.cards).map((v) => v.rule),
    ...heroActiveOmissions(ranked, input.allowedIngredients ?? []),
  ];

  return {
    problems: [
      ...new Set([...violations.map((v) => v.rule), ...substanceProblems]),
    ].slice(0, 8),
    violations,
    reasons: ranked,
    strandTips: fit.strandTips,
    score: concern.score,
    qualityScore: axes.qualityScore,
    relevanceNote: axes.relevanceNote,
    cards: benign.cards,
    concernCorrections: {
      synthesisedPluses: concern.synthesisedPluses ?? 0,
      reframed: concern.reframed,
      reflagged: concern.reflagged,
      downgradedFlags: benign.downgraded,
    },
    concernContribution: concern.contribution,
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
  // STRUCTURAL FIELDS ARE NEVER NULLED. `ingredients` (the verified INCI list
  // read off the pack), the identity fields and the numbers are held data, not
  // generated prose: nulling them left members with a saved product that had no
  // ingredient list at all, so the page read "we couldn't read the ingredients"
  // and the follow-up ingredient pass refused to run.
  const STRUCTURAL = new Set([
    "ingredients",
    "key_ingredients",
    "product_name",
    "brand",
    "category",
    "match_score",
    "quality_score",
  ]);
  for (const v of violations) {
    const m = v.field.match(/^([A-Za-z_]+)\[(\d+)\]/);
    if (m) {
      const set = dropped.get(m[1]) ?? new Set<number>();
      set.add(Number(m[2]));
      dropped.set(m[1], set);
      continue;
    }
    const key = v.field.split(/[.[]/)[0];
    if (STRUCTURAL.has(key)) continue;
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
