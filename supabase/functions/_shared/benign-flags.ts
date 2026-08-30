// BENIGN FUNCTIONAL INGREDIENTS ARE NOT A WARNING
// ===============================================
// 2026-08-30. The anti-scaremonger philosophy is a prompt rule, so models kept
// drifting back to flagging preservatives, pH adjusters, colourants, fragrance
// and emulsifiers "warn" purely for existing at legal limits (sodium benzoate,
// potassium sorbate and a nitrate salt all flagged on the K18 row while the
// member has no declared sensitivity to any of them).
//
// This module makes the rule deterministic. A benign functional ingredient may
// only carry a caution flag when ONE of the three documented tests is met:
//   1. it appears in the member's DECLARED topical sensitivities / allergies,
//   2. it appears on her documented avoid-ingredients list,
//   3. the card itself states a measurable trait conflict (its own text, not a
//      class assumption).
// Otherwise the flag is normalised down. Nothing else about the card changes —
// the body copy is untouched, so the member still reads what it does.

const CLASS_PATTERNS: RegExp[] = [
  // preservatives
  /\bsodium benzoate\b/i,
  /\bpotassium sorbate\b/i,
  /\bbenzoic acid\b/i,
  /\bsorbic acid\b/i,
  /\bphenoxyethanol\b/i,
  /\bethylhexylglycerin\b/i,
  /\bcaprylyl glycol\b/i,
  /\bdehydroacetic acid\b/i,
  /\bbenzyl alcohol\b/i,
  /\bparaben\b/i,
  /\bsodium nitrate\b/i,
  /\bsodium (?:sulfite|sulphite|metabisulfite)\b/i,
  // pH adjusters / buffers / chelators
  /\bcitric acid\b/i,
  /\bsodium citrate\b/i,
  /\bsodium hydroxide\b/i,
  /\bpotassium hydroxide\b/i,
  /\blactic acid\b/i,
  /\b(?:di)?sodium phosphate\b/i,
  /\btromethamine\b/i,
  /\btetrasodium (?:edta|glutamate diacetate)\b/i,
  /\bdisodium edta\b/i,
  // emulsifiers / solubilisers / thickeners
  /\bpolysorbate \d+\b/i,
  /\bpeg-\d+\b/i,
  /\bxanthan gum\b/i,
  /\bhydroxyethylcellulose\b/i,
  /\bcarbomer\b/i,
  // fragrance and colour
  /\b(?:fragrance|parfum)\b/i,
  /\bci \d{5}\b/i,
  /\bmica\b/i,
  /\btitanium dioxide\b/i,
];

/** Class labels a card may name for itself. */
const CLASS_WORDS =
  /\b(preservative|ph adjuster|ph-adjuster|buffer(?:ing)?|chelator|sequestrant|emulsifier|solubiliser|solubilizer|colourant|colorant|thickener|fragrance)\b/i;

/** Text that states a real, measurable conflict for this member. */
const REAL_CONFLICT: RegExp[] = [
  /\bdeclared\b/i,
  /\bsensitivit/i,
  /\ballerg/i,
  /\byou (?:have )?reacted\b/i,
  /\bavoid completely\b/i,
  /\bon your avoid list\b/i,
  /\bflagged (?:by|in) your\b/i,
  /\bdiagnos/i,
];

const norm = (s: string) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface BenignFlagInput {
  cards: unknown;
  /** Declared topical sensitivities + documented allergies (any casing). */
  declaredSensitivities?: unknown;
  /** The member's documented avoid-ingredients list. */
  avoidIngredients?: unknown;
}

export interface BenignFlagResult {
  cards: unknown;
  /** How many cautions were normalised — logged, never member-facing. */
  downgraded: number;
}

const toNames = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .map((v) => norm(typeof v === "string" ? v : String((v as { name?: string })?.name ?? "")))
    .filter(Boolean);

/** True when this ingredient is a routine functional/benign component. */
export function isBenignFunctional(name: string, text = ""): boolean {
  const hay = `${name} ${text}`;
  if (CLASS_PATTERNS.some((re) => re.test(hay))) return true;
  // A card that describes itself purely as a preservative / pH adjuster /
  // emulsifier / colourant counts too.
  return CLASS_WORDS.test(text);
}

/**
 * Deterministic flag policy. Runs after the model answers and after the
 * concern-fit pass, so a declared sensitivity (which is applied separately and
 * always wins) is never softened here.
 */
export function applyBenignFlagPolicy(input: BenignFlagInput): BenignFlagResult {
  if (!Array.isArray(input.cards)) return { cards: input.cards, downgraded: 0 };
  const blocked = new Set([
    ...toNames(input.declaredSensitivities),
    ...toNames(input.avoidIngredients),
  ]);
  let downgraded = 0;

  const cards = input.cards.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const row = { ...(raw as Record<string, unknown>) };
    const name = typeof row.name === "string" ? row.name : "";
    const text = [row.body, row.benefit, row.reason]
      .filter((v) => typeof v === "string")
      .join(" ");

    const isCaution = row.flag === "warn" || row.tone === "warn";
    if (!isCaution) return raw;
    if (!isBenignFunctional(name, text)) return raw;

    // Test 1 & 2 — declared sensitivity or documented avoid entry.
    const key = norm(name);
    const declared = [...blocked].some((b) => b && (key.includes(b) || b.includes(key)));
    if (declared) return raw;
    // Test 3 — the card itself states a real conflict for her.
    if (REAL_CONFLICT.some((re) => re.test(text))) return raw;

    if (row.flag === "warn") row.flag = "good";
    if (row.tone === "warn") row.tone = "good";
    downgraded += 1;
    return row;
  });

  return { cards, downgraded };
}

/** Prompt block — the same rule, told to the model up front. */
export const BENIGN_FLAG_RULES = `PRESERVATIVES, FRAGRANCE, COLOURANTS, pH ADJUSTERS AND EMULSIFIERS ARE NOT A WARNING:
Existence is not a risk. A routine preservative (sodium benzoate, potassium sorbate, phenoxyethanol, parabens at legal limits, a nitrate/sulphite salt), a pH adjuster or buffer (citric acid, sodium hydroxide, phosphates), a chelator, an emulsifier/solubiliser (polysorbates, PEGs), a thickener, a colourant or fragrance must be flagged "good" — NOT "warn" and never "avoid" — unless ONE of these is true:
  1. it appears in this member's DECLARED topical sensitivities or a documented allergy,
  2. it appears on her documented avoid-ingredients list, or
  3. you can name a measurable conflict with a trait she actually holds.
"Patch test", "watch how your scalp reacts", "fine for most people" are NOT reasons to flag — say nothing of the sort. This is validated deterministically after you answer, so a class-based caution is simply overwritten.`;
