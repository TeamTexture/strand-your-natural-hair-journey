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

import { normaliseInciKey } from "../_shared/ingredient-copy.ts";

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
 * FALSE-POSITIVE FIX (2026-08-28). `normaliseInciKey` drops parentheticals, so
 * a stored "butyrospermum parkii (shea) butter" produced the key
 * "butyrospermum parkii butter" and the perfectly legitimate phrase "shea
 * butter" was reported as an ingredient that is not in the formula. Three
 * generations were rejected on that basis, the terminal fallback dropped the
 * offending score_reasons rows, and the member saw a verdict card with no
 * reasoning bullets at all.
 *
 * The haystack keeps EVERY word of the supplied list — parenthetical common
 * names, "/"-separated bilingual synonyms and all — so a vocabulary name counts
 * as supplied whenever its own words appear inside one of the product's own
 * ingredient strings.
 */
const allowedHaystacks = (ctx: NameLockContext): string[] =>
  ctx.allowed
    .flatMap((n) => {
      const raw = (n ?? "").toString();
      // Keep the parenthetical and slash-separated variants as their own
      // entries, plus one entry with all punctuation flattened.
      const parts = [
        raw,
        ...raw.split("/"),
        ...(raw.match(/\(([^)]*)\)/g) ?? []).map((p) => p.replace(/[()]/g, " ")),
      ];
      return parts.map((p) =>
        p
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .replace(/\s+/g, " "),
      );
    })
    .filter(Boolean);

const flatKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * PERFORMANCE (2026-09-07). The checks below are unchanged in what they
 * reject; only the arithmetic behind them is cheaper. A 35-ingredient product
 * with ~1,000 known molecule names in the detection vocabulary and ~54 prose
 * fields spent 4.4 SECONDS of worker CPU here, which killed the isolate with
 * "CPU Time exceeded" after the model had already answered. Three changes, all
 * output-identical:
 *
 *   1. The supplied-name haystacks are reduced to word SETS once per context.
 *      The old test was `haystack.includes(key) || sequenceRegex.test(h) ||
 *      everyWordPresent(h)`; the first two conditions each imply the third
 *      (a haystack is space-separated alphanumeric words, so a `\b`-bounded
 *      word test and set membership decide the same thing), so the union of
 *      the three is exactly `everyWordPresent`.
 *   2. The vocabulary is filtered ONCE per context rather than once per field.
 *      Nothing in that filter (length, ambiguity, already-supplied) depends on
 *      the text being checked.
 *   3. A phrase can only match `\bphrase\b` if the text contains the phrase as
 *      a substring, so a lower-cased `includes` prefilter runs before any
 *      regex — and the regexes themselves are compiled once, not per field.
 */
interface PreparedLock {
  allow: Set<string>;
  /** One word-set per supplied ingredient string variant. */
  haystacks: Array<Set<string>>;
  /** Every word appearing in any haystack — a cheap early reject. */
  anyWord: Set<string>;
  /** Vocabulary names that are candidates for a violation, in vocabulary order. */
  candidates: Array<{
    key: string;
    name: string;
    surfaces: Array<{ form: string; lower: string; re: RegExp }>;
  }>;
}

const prepared = new WeakMap<NameLockContext, PreparedLock>();

function prepare(ctx: NameLockContext): PreparedLock {
  const cached = prepared.get(ctx);
  if (cached) return cached;

  const allow = allowedKeys(ctx);
  const haystacks = allowedHaystacks(ctx).map((h) => new Set(h.split(" ")));
  const anyWord = new Set<string>();
  for (const h of haystacks) for (const w of h) anyWord.add(w);

  const supplied = (name: string) => isSupplied(name, haystacks, anyWord);

  const candidates: PreparedLock["candidates"] = [];
  for (const known of ctx.vocabulary) {
    const name = known.trim();
    if (name.length < 5) continue;
    if (AMBIGUOUS.has(name.toLowerCase())) continue;
    const key = normaliseInciKey(name);
    if (!key || allow.has(key)) continue;
    if (supplied(name)) continue;
    const surfaces = [name, ...(PROSE_ALIASES[key] ?? [])]
      .filter((form) => form === name || !supplied(form))
      .map((form) => ({
        form,
        lower: form.toLowerCase(),
        re: new RegExp(`\\b${escape(form)}\\b`, "i"),
      }));
    candidates.push({ key, name, surfaces });
  }

  const out: PreparedLock = { allow, haystacks, anyWord, candidates };
  prepared.set(ctx, out);
  return out;
}

/** True when every word of the name appears in one supplied ingredient string. */
function isSupplied(
  name: string,
  haystacks: Array<Set<string>>,
  anyWord: Set<string>,
): boolean {
  const key = flatKey(name);
  if (!key) return false;
  const words = key.split(" ");
  for (const w of words) if (!anyWord.has(w)) return false;
  return haystacks.some((h) => words.every((w) => h.has(w)));
}




/**
 * PLAIN-ENGLISH ALIASES (2026-08-28). The detection vocabulary holds INCI
 * display names, so a write-up that said "Denatured alcohol high in formula"
 * for a serum with no alcohol at all sailed past the lock — "denatured
 * alcohol" does not match the key "alcohol denat". These are the everyday
 * renderings of INCI names the model actually reaches for; each is only
 * flagged when the canonical ingredient is NOT in this product's list and the
 * alias's own words are not in the supplied list either.
 */
const PROSE_ALIASES: Record<string, string[]> = {
  "alcohol denat": ["denatured alcohol", "sd alcohol", "ethanol denat"],
  "petrolatum": ["petroleum jelly"],
  "paraffinum liquidum": ["mineral oil", "liquid paraffin"],
  "butyrospermum parkii butter": ["shea butter"],
  "theobroma cacao seed butter": ["cocoa butter"],
  "cocos nucifera oil": ["coconut oil"],
  "olea europaea fruit oil": ["olive oil"],
  "ricinus communis seed oil": ["castor oil"],
  "argania spinosa kernel oil": ["argan oil"],
  "simmondsia chinensis seed oil": ["jojoba oil"],
  "aloe barbadensis leaf juice": ["aloe vera"],
  "sodium lauryl sulfate": ["lauryl sulphate", "lauryl sulfate"],
  "sodium laureth sulfate": ["laureth sulphate", "laureth sulfate"],
  "dimethicone": ["silicone oil"],
};

/**
 * Per-ingredient CARD names: every name must map to a supplied ingredient.
 * Returns the violations; the caller rejects and retries.
 */
export function validateIngredientCardNames(
  cards: unknown,
  ctx: NameLockContext,
  /** The payload key the cards live under, so the violation names the CARD
   *  (`key_ingredients[2].name`) and a repair drops that one card instead of
   *  nulling the whole verified ingredient list. */
  cardsField = "ingredients",
): NameLockViolation[] {
  if (!Array.isArray(cards)) return [];
  const lock = prepare(ctx);
  if (lock.allow.size === 0) return [];
  const out: NameLockViolation[] = [];
  cards.forEach((raw, i) => {
    const name = typeof (raw as { name?: unknown })?.name === "string"
      ? (raw as { name: string }).name.trim()
      : "";
    if (!name) return;
    if (
      !lock.allow.has(normaliseInciKey(name)) &&
      !isSupplied(name, lock.haystacks, lock.anyWord)
    ) {
      out.push({
        field: `${cardsField}[${i}].name`,
        phrase: name,
        rule:
          `"${name}" is not in this product's supplied ingredient list. Every ingredient card must use a name EXACTLY as supplied — never a corrected spelling, a more specific chemical, a merged name, or an ingredient you expect to be in this kind of product.`,
      });
    }
  });
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
  const lock = prepare(ctx);
  if (lock.allow.size === 0) return [];
  const lower = text.toLowerCase();
  const out: NameLockViolation[] = [];
  const seen = new Set<string>();
  for (const candidate of lock.candidates) {
    if (seen.has(candidate.key)) continue;
    // A `\bphrase\b` match requires the phrase as a substring, so the cheap
    // `includes` runs first and the compiled regex only settles boundaries.
    const hit = candidate.surfaces.find(
      (s) => lower.includes(s.lower) && s.re.test(text),
    )?.form;
    if (hit) {
      seen.add(candidate.key);
      out.push({
        field,
        phrase: candidate.name,
        rule:
          `${field} names "${hit}", which is NOT in this product's ingredient list. You may only name ingredients that literally appear in the supplied list. Remove it or rewrite the sentence around an ingredient that is actually in the formula.`,
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
COPY, DO NOT TRANSLATE. Every ingredient name you write must be copied character-for-character from that list. This is the single most common reason a generation is thrown away (2026-09-03: the top rejections were all common-name substitutions), so read these before you write:
- If the list says "Ricinus Communis Seed Oil", write that — NOT "Castor Oil".
- If the list says "Cocos Nucifera (Coconut) Oil", write it in full — NOT "Coconut Oil", NOT "Cocos Nucifera Oil".
- If the list says "Lavandula Angustifolia Oil", do NOT write "Lavender" or "Lavender Oil".
- If the list says "Hydrolyzed Keratin", do NOT write "Hydrolysed Keratin", "Keratin" or "Silk Protein".
- Never shorten, never anglicise, never add or remove a bracketed part, never merge two entries, never pluralise, never swap a British and American spelling.
Any other ingredient name — a corrected spelling, a common name, a more specific chemical than the list states, a merged name, a synonym, or one you expect a product like this to contain — is a hard failure and the whole generation is rejected. If you want to talk about something that is not on the list, talk about one that IS in the list instead, or describe the ingredient family in general words with no name at all.`;
}
