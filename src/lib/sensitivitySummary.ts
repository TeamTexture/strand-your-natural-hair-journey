// Safety filter for AI product summaries when a declared topical sensitivity
// matches the product's INCI list.
//
// The score, stars and verdict label are already overridden deterministically
// (see src/lib/sensitivityCeiling.ts). The AI summary paragraph, however, was
// generated against the stored score and can still read "…a strong match for
// sealing…" directly beside "Best avoided — contains Fragrance/parfum".
//
// This is deterministic text filtering only: no model call, no network.

const POSITIVE_CLAIM =
  /\b(strong|excellent|great|perfect|ideal|brilliant|superb|solid|good|well[- ]suited|suits you|works well|great fit|good fit|recommend(?:ed)?|love this|winner|match for|well matched|a match)\b/i;

/** Split prose into sentences, keeping their terminating punctuation. */
const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Remove any sentence that makes a positive/endorsing claim about the product.
 * Returns the remaining neutral text, or an empty string when nothing survives
 * (in which case the caller shows only the deterministic warning copy).
 */
export const stripPositiveClaims = (text: string | null | undefined): string => {
  if (!text) return "";
  const kept = sentences(text).filter((s) => !POSITIVE_CLAIM.test(s));
  return kept.join(" ").trim();
};

/**
 * The summary text to render for a product. When a sensitivity match is
 * present, endorsements are stripped; otherwise the summary is untouched.
 */
export const safeProductSummary = (
  text: string | null | undefined,
  hasSensitivity: boolean,
): string => (hasSensitivity ? stripPositiveClaims(text) : (text ?? ""));
