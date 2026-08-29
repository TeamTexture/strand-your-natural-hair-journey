declare const Deno: { env: { get(key: string): string | undefined } };

// CONTENT INTEGRITY — the single guardrail every member-facing generation runs
// ===========================================================================
// 2026-08-28. Today produced three separate fabrication incidents on three
// separate surfaces: an invented compound term ("high porosity scalp") in a
// product analysis, an ingredient reasoned about that was not in the formula,
// and an invented application condition ("apply to damp scalp") the
// manufacturer never stated. Each was fixed inside the function that broke.
//
// This module ends that pattern. It is the ONE place the three checks live,
// and every function that writes text a member reads routes through it:
//
//   1. CLOSED VOCABULARY — hair/scalp/scientific terminology must come from
//      the approved list built from Paige's manuscript + established science
//      (`_shared/hair-vocabulary.ts`). An unapproved or domain-crossed term is
//      REJECTED and the field nulled — never retried-and-hoped into the UI.
//   2. SOURCE LOCKDOWN — an ingredient may only be named if it is in the
//      scanned/verified list for that product (`_shared/ingredient-name-lock.ts`),
//      and a technique specific (wet/dry, amount, timing, tool, frequency,
//      temperature, rinse) may only be stated if it appears in real
//      manufacturer directions, or is explicitly framed as general guidance
//      with no product-specific claim attached (`_shared/usage-grounding.ts`).
//   3. NULLABLE BY DEFAULT — nulling the field, or omitting it, is the
//      correct, expected, NON-ERROR output when the held data does not support
//      a claim. This is not opt-in: `enforceContentIntegrity` always nulls
//      rather than throws, for every caller.
//   4. LOGGED — every rejection is written to `public.ai_content_rejections`
//      so Paige can review what the models tried to say (see the queries in
//      the header of that table's migration, and CLAUDE.md).
//
// STANDING RULE: any new AI-generation function MUST call
// `enforceContentIntegrity` (or `checkContentIntegrity` inside its own
// reject-and-retry loop) before its output reaches a member. No exceptions.

import { validateTerminologyFields, type VocabularyViolation } from "./hair-vocabulary.ts";
import {
  buildNameLock,
  validateIngredientCardNames,
  validateNameLockFields,
  type NameLockContext,
} from "./ingredient-name-lock.ts";
import {
  scrubUngroundedUsage,
  validateUsageGrounding,
  type UsageDirections,
} from "./usage-grounding.ts";
import { applyFieldNulls } from "./analysis-failsafes.ts";
// THIRD GUARDRAIL (2026-08-29): invented RELATIONSHIPS between real, approved
// nouns — "high porosity hair loses oil fast". Additive: it runs alongside the
// vocabulary and source lockdowns, and changes neither.
import { relationshipBlock, validateRelationshipFields } from "./relationships.ts";

export type IntegrityCheck =
  | "closed_vocabulary"
  | "ingredient_name_lock"
  | "usage_grounding"
  | "relationship_integrity";

export interface IntegrityViolation {
  /** Dotted/indexed path of the offending field, e.g. `tips[2].body`. */
  field: string;
  phrase: string;
  rule: string;
  check: IntegrityCheck;
}

export interface IntegrityField {
  field: string;
  text: unknown;
}

export interface ContentIntegrityInput {
  /** Edge function name, as it should appear in the rejection log. */
  functionName: string;
  /** Optional narrower surface label (e.g. `meal_ideas`). */
  surface?: string | null;
  userId?: string | null;
  /** What the copy is about — product key, marker, meal plan id. */
  subject?: string | null;
  /** The prose fields to police. Non-strings are ignored. */
  fields: IntegrityField[];
  /**
   * Ingredient cards (`{ name, body }`) when the payload carries them, so a
   * card naming an ingredient outside the formula is caught too.
   */
  cards?: unknown;
  /**
   * SOURCE LOCKDOWN: the verified ingredient list held for this product.
   * `null`/omitted disables the name lock (a surface with no product context,
   * like a blood summary); an EMPTY ARRAY means "no ingredients were read",
   * which forbids naming any ingredient at all.
   */
  allowedIngredients?: string[] | null;
  /** STRAND's known molecule names — the detection vocabulary. */
  ingredientVocabulary?: string[] | null;
  /**
   * SOURCE LOCKDOWN: the real manufacturer directions for this product and
   * where they came from. Omit on surfaces with no product directions.
   */
  directions?: UsageDirections | null;
  attempt?: number;
}

export interface ContentIntegrityResult {
  violations: IntegrityViolation[];
  /** De-duplicated retry instructions. Non-empty means REJECT and re-ask. */
  problems: string[];
  ok: boolean;
}

const tag = (
  check: IntegrityCheck,
  v: { field: string; phrase?: string; sentence?: string; rule: string },
): IntegrityViolation => ({
  check,
  field: v.field,
  phrase: (v.phrase ?? v.sentence ?? "").slice(0, 400),
  rule: v.rule,
});

/**
 * Run every check. Pure and synchronous, so it can sit inside an existing
 * reject-and-retry loop without changing its control flow.
 */
export function checkContentIntegrity(
  input: ContentIntegrityInput,
): ContentIntegrityResult {
  const fields = input.fields.filter((f) => typeof f.text === "string" && f.text.trim());
  const violations: IntegrityViolation[] = [];

  // 1. Closed vocabulary — runs on EVERY surface, always.
  for (const v of validateTerminologyFields(fields) as VocabularyViolation[]) {
    violations.push(tag("closed_vocabulary", v));
  }

  // 1b. Relationship integrity — every causal/mechanistic claim must sit inside
  // the manuscript's approved relationship set. Runs on EVERY surface, always.
  for (const v of validateRelationshipFields(fields)) {
    violations.push(tag("relationship_integrity", v));
  }

  // 2a. Source lockdown — ingredient names.
  if (Array.isArray(input.allowedIngredients)) {
    const lock: NameLockContext = buildNameLock(
      input.allowedIngredients,
      input.ingredientVocabulary ?? [],
    );
    for (const v of validateIngredientCardNames(input.cards, lock)) {
      violations.push(tag("ingredient_name_lock", v));
    }
    for (const v of validateNameLockFields(fields, lock)) {
      violations.push(tag("ingredient_name_lock", v));
    }
  }

  // 2b. Source lockdown — technique specifics.
  if (input.directions) {
    const usageFields = fields.map((f) => ({
      field: f.field,
      text: typeof f.text === "string" ? f.text : null,
    }));
    for (const p of validateUsageGrounding(usageFields, input.directions)) {
      violations.push(tag("usage_grounding", p));
    }
  }

  return {
    violations,
    problems: [...new Set(violations.map((v) => v.rule))].slice(0, 8),
    ok: violations.length === 0,
  };
}

/** All string leaves of a payload, as `path` → text. Used by surfaces that
 *  have no hand-written field map, so a new field is policed automatically
 *  instead of silently escaping the guardrail. */
export function collectProseFields(
  value: unknown,
  path = "",
  out: IntegrityField[] = [],
  depth = 0,
): IntegrityField[] {
  if (depth > 6) return out;
  if (typeof value === "string") {
    if (value.trim().length > 2) out.push({ field: path || "text", text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectProseFields(v, `${path}[${i}]`, out, depth + 1));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Never police machine fields — ids, versions, urls, timestamps.
      if (/^(_|id$|.*_id$|.*_url$|.*_at$|url|kind|slug|status|source|storage_path)/.test(k)) continue;
      collectProseFields(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
  return out;
}

/**
 * TERMINAL ENFORCEMENT — the call every generation function makes before its
 * output reaches a member. Nulls/removes the offending fields in place, logs
 * every rejection, and returns what it did. Never throws: an empty field is
 * always a valid, expected answer, and always safer than a wrong one.
 */
export async function enforceContentIntegrity(
  payload: Record<string, unknown>,
  input: Omit<ContentIntegrityInput, "fields"> & { fields?: IntegrityField[] },
): Promise<ContentIntegrityResult & { cleared: string[] }> {
  const fields = input.fields ?? collectProseFields(payload);
  const result = checkContentIntegrity({ ...input, fields });
  if (result.ok) return { ...result, cleared: [] };

  // Technique specifics are scrubbed sentence-by-sentence where we can, so a
  // single invented condition does not cost the member the whole write-up.
  const usageOnly = result.violations.filter((v) => v.check === "usage_grounding");
  if (input.directions && usageOnly.length) {
    for (const v of usageOnly) {
      const key = v.field.split(/[.[]/)[0];
      if (typeof payload[key] === "string") {
        const scrubbed = scrubUngroundedUsage(payload[key] as string, input.directions);
        if (scrubbed.removed) payload[key] = scrubbed.text || null;
      }
    }
  }

  const cleared = applyFieldNulls(
    payload,
    result.violations
      .filter((v) => !(v.check === "usage_grounding" && typeof payload[v.field.split(/[.[]/)[0]] === "string"))
      .map((v) => ({ field: v.field, phrase: v.phrase, rule: v.rule })),
  );

  console.warn(JSON.stringify({
    function: input.functionName,
    event: "content_integrity_enforced",
    checks: [...new Set(result.violations.map((v) => v.check))],
    cleared,
    problems: result.problems.slice(0, 3),
  }));

  await logContentIntegrityRejections(result.violations, {
    ...input,
    action: "field_nulled",
  });

  return { ...result, cleared };
}

/**
 * Append-only rejection log for author review. Best-effort — a failed write
 * never blocks or fails a generation.
 */
export async function logContentIntegrityRejections(
  violations: Array<Omit<IntegrityViolation, "check"> & { check?: IntegrityCheck }>,
  meta: {
    functionName: string;
    surface?: string | null;
    userId?: string | null;
    subject?: string | null;
    attempt?: number;
    /** `rejected` = generation re-asked; `field_nulled` = served without it. */
    action: "rejected" | "field_nulled";
  },
): Promise<void> {
  if (!violations.length) return;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_content_rejections").insert(
      violations.slice(0, 40).map((v) => ({
        function_name: meta.functionName,
        surface: meta.surface ?? meta.functionName,
        user_id: meta.userId ?? null,
        subject: meta.subject ?? null,
        check_name: v.check ?? "closed_vocabulary",
        field: v.field,
        phrase: v.phrase,
        rule: v.rule.slice(0, 1000),
        action: meta.action,
        attempt: meta.attempt ?? null,
      })),
    );
  } catch (e) {
    console.warn("[content-integrity] rejection log write failed:", e instanceof Error ? e.message : e);
  }
}

/** The prompt-side statement of the same contract, so the model is told the
 *  rules it will be validated against. Compose with the surface's own prompt. */
export function contentIntegrityBlock(opts: {
  allowedIngredients?: string[] | null;
  directions?: UsageDirections | null;
} = {}): string {
  const lines = [
    `
CONTENT INTEGRITY — hard validation runs on your output:
- TERMINOLOGY IS CLOSED. Use only hair/scalp terms this app already teaches (porosity, cuticle, cortex, elasticity, strand diameter, surface texture, curl pattern, density, scalp condition, sebum, follicle, moisture retention, protein balance, build-up, length retention). Never invent a compound term, and never attach a strand property to the scalp — "high porosity scalp" is a hard failure.
- NOTHING INVENTED TO FILL A GAP. Every ingredient, claim and technique detail must be traceable to the data supplied in this prompt. Established general knowledge is allowed only when no product-specific claim is attached to it.
- "NOT ESTABLISHED" IS A CORRECT ANSWER. Every descriptive field is nullable. If the supplied data does not support a claim, return null for that field or leave it out. That is expected, not a failure.`,
    relationshipBlock(),
  ];
  if (Array.isArray(opts.allowedIngredients)) {
    lines.push(
      opts.allowedIngredients.length
        ? `- The ONLY ingredient names you may write anywhere are: ${opts.allowedIngredients.join(", ")}.`
        : `- No ingredient list was read for this product. Do NOT name a single ingredient anywhere, and do not infer a typical formulation.`,
    );
  }
  if (opts.directions) {
    lines.push(
      opts.directions.text
        ? `- The real manufacturer directions are: "${opts.directions.text}". Any technique specific (wet/dry, amount, timing, tool, frequency, temperature, rinsing) must appear in those directions.`
        : `- No manufacturer directions could be sourced. Do not state any technique specific as if it were this product's instruction; if you give general advice, say plainly that it is general guidance.`,
    );
  }
  return lines.join("\n");
}
