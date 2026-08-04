/**
 * PARAGRAPH SHAPE — client side.
 *
 * The AI is instructed (see `supabase/functions/_shared/paragraph-rules.ts`) to
 * separate mechanism / what-it-means-for-you / what-to-do-with-it with blank
 * lines. Every prose renderer splits on those blank lines and renders each
 * block as its own spaced paragraph.
 */

/** Split prose into paragraph blocks on blank lines (tolerating \r\n). */
export function splitParagraphs(text: string | null | undefined): string[] {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** True when the text carries an explicit paragraph break. */
export const hasParagraphs = (text: string | null | undefined) =>
  /\n\s*\n/.test(String(text ?? ""));

/**
 * Apply a single-paragraph transformer to each paragraph and rejoin with blank
 * lines, so no client-side shaper flattens the structure.
 */
export function perParagraph(
  text: string | null | undefined,
  fn: (paragraph: string) => string,
): string {
  const raw = String(text ?? "");
  if (!hasParagraphs(raw)) return fn(raw);
  return splitParagraphs(raw)
    .map((p) => fn(p).trim())
    .filter(Boolean)
    .join("\n\n");
}
