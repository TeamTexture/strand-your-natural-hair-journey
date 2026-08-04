// PURPOSE INSIGHT — the single major piece of product advice that replaces the
// old generic "what this product is made for" explanatory copy.
//
// It must reason through one explicit chain:
//   PRODUCT PURPOSE → INGREDIENT EMPHASIS → USER'S HAIR → SPECIFIC
//   IMPLICATION → HOW TO USE
//
// Shared by product-analyse (photo), product-analyse-url and
// ingredient-analysis so every path emits an identical shape.

export interface PurposeInsight {
  /** What the product is formulated to do, inferred from its type/claims. */
  purpose: string;
  /** The ingredient(s) from ITS OWN list carried in higher proportion to
   *  achieve that purpose, plus why they are emphasised. */
  ingredient_factor: string;
  /** What that means for THIS user, through ONE named characteristic,
   *  trait or flagged marker. */
  implication: string;
  /** The concrete usage adjustment, tied to one of her stated goals. */
  usage_direction: string;
}

/** JSON-schema fragment for the tool/response schema (both providers). */
export const PURPOSE_INSIGHT_SCHEMA_PROPERTY = {
  type: "object",
  description:
    "ONE major insight explaining why this product behaves the way it does FOR THIS USER, reasoned as: purpose → ingredient emphasis → her hair → specific implication → how to use. Total across all four fields must stay under 70 words.",
  properties: {
    purpose: {
      type: "string",
      description:
        "≤16 words. What this product is formulated to DO, inferred from its type, range and front-of-pack claims (e.g. 'formulated to deep-cleanse and lift product build-up'). Never a marketing slogan, never invented.",
    },
    ingredient_factor: {
      type: "string",
      description:
        "≤20 words naming the ACTUAL ingredient(s) from this product's own list that are carried in higher proportion to achieve that purpose, and why (e.g. 'so SLES sits high in the list as the primary detergent'). Never name an ingredient that is not in the supplied list.",
    },
    implication: {
      type: "string",
      description:
        "≤20 words on what that means for THIS user, running through ONE named characteristic, trait, logged signal or flagged marker (e.g. 'your high porosity means open cuticles lose water faster after a strong cleanse').",
    },
    usage_direction: {
      type: "string",
      description:
        "≤24 words: how to get the most from it plus the signal to watch for, tied to one of her stated goals or challenges (e.g. 'work it through the scalp, then condition with heat — if lengths feel soft afterwards it suits you'). NEVER a frequency cap, limit or prohibition.",
    },
  },
  required: ["purpose", "ingredient_factor", "implication", "usage_direction"],
} as const;

/** Prompt block appended to every product-analysis system/task prompt. */
export const PURPOSE_INSIGHT_RULES = `PURPOSE INSIGHT — ONE MAJOR PIECE OF ADVICE (replaces all generic explanatory copy):
Return insight: { purpose, ingredient_factor, implication, usage_direction }. Together they must read as ONE cohesive chain of reasoning:
  "Because this product is formulated to [purpose], [ingredient(s) from ITS OWN list] sit in higher proportion to achieve that — with your [named characteristic] this means [specific consequence for her], so [how to get the most from it] and watch for [signal] to judge whether it suits your hair."
- purpose: inferred ONLY from the product's type, range, claims and ingredient order. Never invent a purpose the product does not claim.
- ingredient_factor: MUST name ingredient(s) that actually appear in the supplied INCI list. Never invent, never generalise to "surfactants" when you can name the molecule.
- implication: MUST run through ONE named user characteristic, trait, logged wash-day signal, or flagged marker. Anything that could be said to any user is INVALID — rewrite it. Never frame normal product behaviour as damage or risk.
- usage_direction: technique that is concrete and performable (where on the head, how, what follows) PLUS the signal that tells her whether it suits her hair, tied to one of HER stated goals or challenges. NEVER a frequency cap, limit, prohibition or "only use every X washes" — frequency is HER decision, informed by how her hair responds.
- TRUTHFULNESS OVER COMPLETENESS: if any link in the chain cannot be established from real data, return the strongest TRUTHFUL shorter version — leave a field near-empty rather than inventing an ingredient, purpose, characteristic or goal.
- TOTAL LENGTH: under 70 words across all four fields. No preamble, no hedging.
- GROUNDING: reason the mechanism (porosity, cuticle behaviour, moisture retention, scalp) from the retrieved manuscript teaching — never name the book, chapters or pages.
- ONE IDEA ONCE: this insight is the BRIDGE, not a restatement. score_reasons explain WHY THE SCORE; the insight explains WHY THIS PRODUCT BEHAVES THIS WAY FOR HER; use_cases/tips/usage_instructions are the routine steps. Do not repeat a score reason or a tip here, and do not repeat this insight there.
- MOISTURE LANGUAGE: products never add, restore, replenish or deliver moisture — they seal, lock, retain or slow water loss.`;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/**
 * Word budgets are enforced by DROPPING whole trailing sentences, never by
 * cutting mid-sentence. A half-sentence ending in an ellipsis reads as broken
 * copy, so if the first sentence already exceeds the budget we keep it whole.
 */
const clampWords = (s: string, max: number) => {
  const text = s.trim();
  if (!text) return "";
  if (words(text).length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  let kept = "";
  for (const sentence of sentences) {
    const candidate = (kept + sentence).trim();
    if (kept && words(candidate).length > max) break;
    kept = candidate + " ";
  }
  return kept.trim() || text;
};

const CAPS = {
  purpose: 16,
  ingredient_factor: 20,
  implication: 20,
  usage_direction: 24,
} as const;

const TOTAL_CAP = 70;

/**
 * Normalises whatever the model returned into the strict contract. Returns
 * null when nothing usable came back (the renderer then shows nothing rather
 * than a broken half-sentence).
 */
export function sanitisePurposeInsight(value: unknown): PurposeInsight | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const read = (k: keyof typeof CAPS) =>
    clampWords(typeof row[k] === "string" ? (row[k] as string) : "", CAPS[k]);

  const out: PurposeInsight = {
    purpose: read("purpose"),
    ingredient_factor: read("ingredient_factor"),
    implication: read("implication"),
    usage_direction: read("usage_direction"),
  };

  // Need at least the purpose plus one more link to be worth rendering.
  const filled = [out.purpose, out.ingredient_factor, out.implication, out.usage_direction]
    .filter((s) => s.length > 0);
  if (!out.purpose || filled.length < 2) return null;

  // Global word budget — trim from the end of the chain backwards.
  let total = filled.reduce((n, s) => n + words(s).length, 0);
  const order: Array<keyof typeof CAPS> = [
    "usage_direction",
    "implication",
    "ingredient_factor",
  ];
  for (const key of order) {
    if (total <= TOTAL_CAP) break;
    const current = words(out[key]).length;
    if (!current) continue;
    const allowed = Math.max(6, current - (total - TOTAL_CAP));
    out[key] = clampWords(out[key], allowed);
    total = words(out.purpose).length +
      words(out.ingredient_factor).length +
      words(out.implication).length +
      words(out.usage_direction).length;
  }

  return out;
}
