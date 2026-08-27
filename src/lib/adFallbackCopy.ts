// DETERMINISTIC FALLBACK COPY FOR AD SURFACES.
//
// The personalised advert line (`fit_line`) comes from a model call that can be
// slow, rate limited or rejected by a guardrail. An advert carrying a paid
// campaign must never be left with a spinner or an empty gap where its usage
// copy should be, so every surface has a non-AI line to fall back to.
//
// STRICT RULE: this file invents NOTHING. It only reuses facts the brand has
// already declared on the product (description, key features) — the same text
// already shown on the product page — or a neutral pointer to the full read. It
// makes no hair-care claim, gives no scalp instruction, and never personalises,
// because nothing here has seen the member's profile.

export interface AdFallbackProduct {
  name: string;
  description?: string | null;
  key_features?: string[] | null;
}

/** First sentence of a block of text, returned whole — the slot wraps, so a
 *  sentence is never sliced mid-thought with an ellipsis. */
function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = clean.match(/^[^.!?]{10,}?[.!?]/);
  return (match?.[0] ?? clean).trim();
}

/**
 * Generic usage copy for an advert whose personalised line is unavailable.
 * Always returns a non-empty string, so the slot is never blank.
 */
export function adFallbackFitLine(product: AdFallbackProduct | null | undefined): string {
  const NEUTRAL = "Open “How to use it for your hair” for the full read on this product.";
  if (!product) return NEUTRAL;

  const declared = String(product.description ?? "").trim();
  if (declared) {
    const sentence = firstSentence(declared);
    if (sentence) return sentence;
  }

  const feature = (product.key_features ?? [])
    .map((f) => String(f ?? "").trim())
    .find((f) => f.length > 8);
  if (feature) return firstSentence(feature);

  return NEUTRAL;
}
