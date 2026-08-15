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

/**
 * DISPLAY-ONLY sentence splitting. Groups a long unbroken block into short
 * paragraphs of at most `perGroup` sentences so it renders as two or three
 * paragraphs instead of one wall. No word is added, removed or reordered.
 */
export function sentenceGroups(
  text: string | null | undefined,
  perGroup = 2,
): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const sentences = raw.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [raw];
  if (sentences.length <= perGroup) return [raw];
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += perGroup) {
    groups.push(sentences.slice(i, i + perGroup).join(" "));
  }
  return groups;
}

/**
 * DISPLAY-ONLY capitalisation: upper-cases the first letter of the block and of
 * each following sentence when the model returned it lowercase. Nothing is
 * written back to the database or to any cached payload.
 */
export function capitaliseSentences(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw) return raw;
  return raw
    .replace(/^(\s*)(\p{Ll})/u, (_m, ws: string, ch: string) => ws + ch.toUpperCase())
    .replace(
      /([.!?]["')\]]?\s+)(\p{Ll})/gu,
      (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
    );
}
