// INGREDIENT-NAMING LOCKDOWN
// ==========================
// 2026-08-28. The model may only name ingredients that literally appear in the
// product's stored ingredients array. This closes off invented ingredients
// entirely — including the near-miss misspellings we have seen in production
// ("paraffinun liquidum", "parfum liquidum") and the generic→specific renames
// the glossary work already banned ("Alcohol" → "Alcohol Denat.").
//
// Detection is closed-set, not open-ended: an output field is checked against
// STRAND's own ingredient vocabulary (the supplied list plus the shared
// `glossary_terms` display names handed in by the caller). Naming a known
// ingredient that is NOT in this product's list is a violation.

import { normaliseInciKey } from "./ingredient-copy.ts";

export interface NameLockViolation {
  field: string;
  phrase: string;
  rule: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words that are ingredient names but also ordinary English — never flagged. */
const AMBIGUOUS = new Set(["water", "aqua", "protein", "alcohol", "oil", "salt", "clay", "honey", "sugar"]);

export interface NameLockContext {
  /** The product's stored ingredient list — the ONLY legal names. */
  allowed: string[];
  /** Known ingredient names from the shared glossary (the detection vocabulary). */
  vocabulary: string[];
}

export function buildNameLock(allowed: string[], vocabulary: string[]): NameLockContext {
  return { allowed, vocabulary };
}

const allowedKeys = (ctx: NameLockContext) =>
  new Set(ctx.allowed.map((n) => normaliseInciKey(n)).filter(Boolean));

/**
 * Per-ingredient CARD names: every name must map to a supplied ingredient.
 * Returns the violations; the caller rejects and retries.
 */
export function validateIngredientCardNames(
  cards: unknown,
  ctx: NameLockContext,
): NameLockViolation[] {
  if (!Array.isArray(cards)) return [];
  const allow = allowedKeys(ctx);
  if (allow.size === 0) return [];
  const out: NameLockViolation[] = [];
  for (const raw of cards) {
    const name = typeof (raw as { name?: unknown })?.name === "string"
      ? (raw as { name: string }).name.trim()
      : "";
    if (!name) continue;
    if (!allow.has(normaliseInciKey(name))) {
      out.push({
        field: "ingredients[].name",
        phrase: name,
        rule:
          `"${name}" is not in this product's supplied ingredient list. Every ingredient card must use a name EXACTLY as supplied — never a corrected spelling, a more specific chemical, a merged name, or an ingredient you expect to be in this kind of product.`,
      });
    }
  }
  return out;
}

/**
 * PROSE fields: no ingredient name may appear unless it is in this product's
 * list. Only names in STRAND's own ingredient vocabulary are detected, so
 * ordinary prose is never falsely flagged.
 */
export function validateIngredientMentions(
  field: string,
  text: unknown,
  ctx: NameLockContext,
): NameLockViolation[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const allow = allowedKeys(ctx);
  if (allow.size === 0) return [];
  const out: NameLockViolation[] = [];
  const seen = new Set<string>();
  for (const known of ctx.vocabulary) {
    const name = known.trim();
    if (name.length < 5) continue;
    if (AMBIGUOUS.has(name.toLowerCase())) continue;
    const key = normaliseInciKey(name);
    if (!key || allow.has(key) || seen.has(key)) continue;
    if (new RegExp(`\\b${escape(name)}\\b`, "i").test(text)) {
      seen.add(key);
      out.push({
        field,
        phrase: name,
        rule:
          `${field} names "${name}", which is NOT in this product's ingredient list. You may only name ingredients that literally appear in the supplied list. Remove it or rewrite the sentence around an ingredient that is actually in the formula.`,
      });
    }
  }
  return out;
}

export function validateNameLockFields(
  fields: Array<{ field: string; text: unknown }>,
  ctx: NameLockContext,
): NameLockViolation[] {
  return fields.flatMap((f) => validateIngredientMentions(f.field, f.text, ctx));
}

/** Prompt block — stated positively, alongside the schema constraint. */
export function ingredientNameLockBlock(allowed: string[]): string {
  if (!allowed.length) {
    return `
INGREDIENT NAMING — LOCKED:
No ingredient list was supplied for this product. Do NOT name a single ingredient anywhere in your output, and do NOT infer a typical formulation. Say plainly that the ingredients could not be read.`;
  }
  return `
INGREDIENT NAMING — LOCKED (hard validation runs on your output):
The ONLY ingredient names you may write, anywhere in any field, are these, spelled exactly as given:
${allowed.map((n) => `- ${n}`).join("\n")}
Any other ingredient name — a corrected spelling, a more specific chemical than the list states, a merged name, a synonym, or one you expect a product like this to contain — is a hard failure and the whole generation is rejected. If the list does not contain an ingredient you want to talk about, talk about one that IS in the list instead.`;
}
