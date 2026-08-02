/**
 * App-wide coherence failsafe for user-facing guidance copy.
 *
 * Any text transform that rewrites AI prose (glossary expansion, condensing,
 * sentence casing) must pass its result through `safeRewrite`. If the rewrite
 * produced something that no longer reads as English, we discard it and show
 * the original sentence instead. A slightly more technical sentence is always
 * better than an incoherent one.
 */

/** Patterns that mean a rewrite has broken the sentence. */
const BROKEN_PATTERNS: RegExp[] = [
  // A hyphen glued onto an inserted phrase, e.g. "2-inch high-how easily your hair…"
  /-\s*(?:how|the|your|this|ingredients?|softening|natural|outer|cleaning)\b/i,
  // Duplicated glossary wrappers.
  /\(this is called[^)]*\(this is called/i,
  // Double parentheses from nested expansion.
  /\(\s*\(/,
  // Stray double punctuation or dangling connectors.
  /\s(?:and|or|but|with|the|a|of|to)\s*[.,;]/i,
  /\b(\w+)\s+\1\b/i,
  // Empty brackets or orphaned brackets.
  /\(\s*\)/,
];

/** True when the string reads as broken English. */
export function isIncoherent(text: string): boolean {
  if (!text) return false;
  const unbalanced =
    (text.match(/\(/g)?.length ?? 0) !== (text.match(/\)/g)?.length ?? 0);
  if (unbalanced) return true;
  return BROKEN_PATTERNS.some((re) => re.test(text));
}

/**
 * Apply a rewrite, but only keep it when the result is still coherent.
 * Falls back to the original text (or to the pre-rewrite input) otherwise.
 */
export function safeRewrite(original: string, rewritten: string): string {
  if (!rewritten) return original;
  if (isIncoherent(rewritten) && !isIncoherent(original)) return original;
  return rewritten;
}
