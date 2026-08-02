/**
 * Sentence-case guard: every sentence in user-facing prose must open with a
 * capital letter, whatever the AI or a legacy cached string produced. Leaves
 * anything that isn't a lowercase letter (numbers, "£", emoji, markdown) alone.
 */
export function capitaliseSentences(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    // Start of the string, or start of any line.
    .replace(/(^|\n\s*)([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
    // After a sentence-ending mark (optionally followed by quotes/brackets).
    .replace(
      /([.!?])(["'\)\]]*\s+)([a-z])/g,
      (_m, mark: string, gap: string, ch: string) => mark + gap + ch.toUpperCase(),
    );
}
