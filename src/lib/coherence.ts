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

/**
 * Remove bracketed definitions/asides from user-facing copy.
 *
 * STRAND never explains a term inside brackets — education is written into the
 * sentence itself. Short functional brackets (units, "2 min", "7 days") are kept.
 */
export function stripDefinitionBrackets(text: string): string {
  if (!text || typeof text !== "string") return typeof text === "string" ? text : "";

  let out = text.replace(
    /(\]?)\s*\(([^()]*)\)/g,
    (full, before: string, inner: string) => {
      // Never touch markdown links — "[TT Heat Hat](https://…)".
      if (before === "]") return full;
      const content = String(inner).trim();
      if (/^https?:\/\//i.test(content)) return full;
      const words = content.split(/\s+/).filter(Boolean);
      const isDefinition =
        /^(?:this is called|i\.e\.|e\.g\.|meaning|means|aka|that is|how |the |ingredients|softening|natural|outer|cleaning)/i.test(
          content,
        ) || words.length >= 3;
      return isDefinition ? "" : full;
    },
  );
  // Tidy the punctuation left behind.
  out = out
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}
