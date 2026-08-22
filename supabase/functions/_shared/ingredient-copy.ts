// Shared copy rules + scrubbers for ingredient-level prose.
//
// The glossary / role / fit copy produced by `ingredient-explainer` must read
// exactly like the copy `ingredient-analysis` already produces: same moisture
// language rule (Chapter 14), same anti-scaremonger philosophy, and the same
// hard ban on referencing any OTHER product or routine step in a usage tip.
// These constants are carried over verbatim so the two paths cannot drift.
//
// PARAGRAPH SAFETY: every scrubber below runs per paragraph (`perParagraph`)
// so a blank line the model inserted at a reasoning bridge survives cleaning.

import { perParagraph } from "./paragraph-rules.ts";

/** INCI lookup key: lowercase, punctuation stripped, whitespace collapsed. */
export function normaliseInciKey(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The manuscript's ingredient framework — the only allowed categories. */
export const INGREDIENT_CATEGORIES = [
  "Preservative",
  "Humectant",
  "Emollient",
  "Occlusive",
  "Surfactant",
  "Conditioning Agent",
  "Protein",
  "Active",
  "Fragrance",
  "Colourant",
  "Solvent",
  "pH Adjuster",
  "Chelator",
  "Emulsifier",
  "Thickener",
  "Antioxidant",
  "Botanical Extract",
] as const;

export const MOISTURE_LANGUAGE_RULE =
  `MOISTURE — NON-NEGOTIABLE LANGUAGE RULE (Chapter 14: Moisture Retention):
Moisture comes from water. Period. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. NEVER write "restores moisture", "adds moisture", "replenishes moisture", "delivers moisture", or "hydrates the strand". Use book-aligned phrasing only: "seals moisture in", "locks moisture in", "helps retain moisture", "slows moisture loss", "supports moisture retention", "softens cuticle so water can absorb during wash day". Conditioners, leave-ins, oils, butters, masks and stylers are sealers / softeners / penetrants / emollients / humectants — never water sources. This rule applies EQUALLY to what_it_is, role_in_product, for_you and usage_tip.`;

export const ANTI_SCAREMONGER_PHILOSOPHY =
  `PHILOSOPHY — READ THIS BEFORE FLAGGING ANYTHING:
We are NOT a Yuka-style scaremonger app. Cosmetic preservatives (phenoxyethanol, parabens at legal limits, sodium benzoate, potassium sorbate, methylisothiazolinone, etc.), fragrance/parfum, colourants, and standard pH adjusters are used in legally-permitted small quantities and are NOT inherently harmful for the general user. Do NOT mark them "bad" purely because they exist in the formula. "bad" requires AT LEAST ONE of: (a) the ingredient or an alias appears in the member's declared topical sensitivities or documented allergies (NEVER merely because it appears in history.flagged_ingredients, which only counts how many of her saved products contain it), (b) a documented allergy / sensitivity / diagnosis in their health profile that this molecule directly aggravates, or (c) a direct conflict with a measurable hair trait they hold. Existence is never harm. Use "warn" — not "bad" — for routine preservatives and fragrance when the user has no flagged sensitivity.`;

export const NO_SOURCE_NAMING_RULE =
  `Never name the source, author, book, chapter or page in any output. Write in your own voice.`;

export const NO_MEDICAL_RULE =
  `NO MEDICAL ADVICE: never name or allude to a diagnosed condition, alopecia of any kind, medication, blood marker, hormone or life stage in any field of this sheet. Those live elsewhere in the app.`;

// ── Scrubbers ────────────────────────────────────────────────────────────

/** Detects references to any OTHER product/step. Carried over verbatim from
 *  ingredient-analysis so `usage_tip` obeys the identical contract. */
export const FORBIDDEN_GUIDANCE_PATTERNS: RegExp[] = [
  /\b(pair|layer|follow|combine|use)\s+(it\s+)?(with|under|over|after|before)\b/i,
  /\bfollow(ed)?\s+(this\s+\w+\s+)?with\b/i,
  /\bthen\s+(apply|use|add|seal|smooth|comb)\b/i,
  /\b(deep\s+conditioner|deep\s+conditioning|conditioning\s+treatment|leave[-\s]?in|hair\s+mask|protein\s+treatment|clarifying\s+wash|pre[-\s]?poo|styler|styling\s+cream|hair\s+oil|scalp\s+oil|hair\s+butter|serum|mousse|gel|edge\s+control|setting\s+lotion|heat\s+protectant|heat\s+protector)\b/i,
  /\bheat\s+(hat|cap)\b/i,
  /\bshower\s+cap\b/i,
  /\bplastic\s+cap\b/i,
  /\bteamtexture\b/i,
  /\btt\s+heat\b/i,
];

/** Banned moisture phrasings and their book-aligned replacements. */
const MOISTURE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(adds|add|adding)\s+moisture\b/gi, "helps retain moisture"],
  [/\b(restores|restore|restoring)\s+moisture\b/gi, "helps retain moisture"],
  [/\b(replenishes|replenish|replenishing)\s+moisture\b/gi, "helps retain moisture"],
  [/\b(delivers|deliver|delivering)\s+moisture\b/gi, "seals moisture in"],
  [/\b(infuses|infuse|infusing)\s+(the\s+\w+\s+with\s+)?moisture\b/gi, "seals moisture in"],
  [/\b(provides|provide|providing)\s+moisture\b/gi, "helps retain moisture"],
  [/\b(injects|inject|injecting)\s+moisture\b/gi, "seals moisture in"],
  [/\bmoisturis(es|e|ing)\s+the\s+(strand|hair|cuticle)\b/gi, "helps the hair retain moisture"],
  [/\bhydrat(es|e|ing)\s+the\s+(strand|strands|hair|cuticle)\b/gi, "softens the cuticle so water can absorb"],
];

/** Rewrites banned moisture phrasing into book-aligned phrasing. Applied to
 *  every generated copy field before it is cached or rendered. */
export function scrubMoistureLanguage(text: string): string {
  return perParagraph(text ?? "", (paragraph) => {
    let out = paragraph;
    for (const [re, replacement] of MOISTURE_REPLACEMENTS) out = out.replace(re, replacement);
    return out.replace(/[ \t]{2,}/g, " ").trim();
  });
}

/** True when the text names or implies another product / routine step. */
export function referencesOtherProduct(text: string): boolean {
  return FORBIDDEN_GUIDANCE_PATTERNS.some((re) => re.test(text ?? ""));
}

/** Drops whole sentences that reference another product or step. Falls back to
 *  a technique-only line when nothing survives, so the UI never renders a
 *  "pair with a deep conditioner" style tip. */
export function scrubOtherProductReferences(text: string, fallback: string): string {
  const out = perParagraph(text ?? "", (paragraph) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    return sentences.filter((s) => !referencesOtherProduct(s)).join(" ").trim();
  }).trim();
  return out.length > 0 ? out : fallback;
}

/** Applies both scrubbers to a usage tip. */
export function cleanUsageTip(text: string): string {
  return scrubMoistureLanguage(
    scrubOtherProductReferences(
      text,
      "Focus on how you apply this product itself — amount, sectioning, water temperature, dwell time and rinse.",
    ),
  );
}

/** Applies the moisture scrubber to descriptive (non-tip) copy. */
export function cleanDescriptiveCopy(text: string): string {
  return scrubMoistureLanguage(text);
}

/** Hard word cap that never cuts mid-sentence when it can avoid it. */
export function clampWords(text: string, maxWords: number): string {
  const raw = (text ?? "").trim();
  // Paragraph breaks are part of the copy contract, so the budget is spent
  // paragraph by paragraph rather than flattening the block.
  if (/\n\s*\n/.test(raw)) {
    const blocks = raw.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
    const kept: string[] = [];
    let budget = maxWords;
    for (const block of blocks) {
      if (budget <= 0) break;
      const shaped = clampWords(block, budget);
      if (!shaped) break;
      kept.push(shaped);
      budget -= shaped.split(/\s+/).filter(Boolean).length;
    }
    return kept.join("\n\n");
  }
  const clean = raw;
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    const candidate = out ? `${out} ${s}` : s;
    if (candidate.split(/\s+/).length > maxWords) break;
    out = candidate;
  }
  if (out) return out.trim();
  return `${words.slice(0, maxWords).join(" ")}.`;
}
