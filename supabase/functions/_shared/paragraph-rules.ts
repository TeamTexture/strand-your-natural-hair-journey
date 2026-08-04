// PARAGRAPH SHAPE — the shared prose contract for every AI text surface.
//
// Every long piece of guidance in STRAND moves through the same reasoning
// shape: what the thing does (mechanism) → what that means for THIS user →
// (where one exists) what she can do about it. Those are separate thoughts, so
// they must be separate paragraphs, not one wall of text.
//
// The model is told to emit a literal blank line (\n\n) at each bridge; every
// post-processor in `_shared/` preserves those blank lines (see
// `perParagraph`), and the client renders each block as its own spaced
// paragraph via `src/components/guidance/GuidanceBody.tsx`.

export const PARAGRAPH_RULES = `PARAGRAPH SHAPE — BREAK AT THE BRIDGE:
Any field longer than roughly two sentences MUST be broken into paragraphs with a literal blank line (a double newline) between them. Never return a single block of four or more sentences.
- Paragraph 1 — MECHANISM: what the ingredient, product, tool, marker or step actually does. Factual, no personalisation.
- Paragraph 2 — WHAT IT MEANS FOR HER: run the mechanism through ONE named data point of hers (porosity, density, texture, diameter, elasticity, scalp condition, current or planned style, a logged wash-day signal, a stated goal or challenge, a flagged marker).
- Paragraph 3 — ONLY IF A REAL MOVE EXISTS: what she can do with that knowledge — technique, what to watch for, how to judge whether it suits her. Never a frequency cap, instruction or prohibition.
Rules:
- Break AT the bridge, never mid-thought. The sentence that pivots from "this is what it does" to "for you this means" starts a NEW paragraph.
- Do not label the paragraphs. No "Mechanism:", no "For you:", no headings, no bullets, no numbering — just prose separated by blank lines.
- If there is genuinely only one thought to convey, return one short paragraph. Never pad to three.
- Blank lines are the ONLY separator. Never use markdown horizontal rules, asterisks or em-dash chains to fake a break.`;

/** Split prose into paragraph blocks on blank lines. */
export function splitParagraphs(text: string): string[] {
  return String(text ?? "")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Runs a single-paragraph transformer over every paragraph of a block of prose
 * and rejoins with blank lines, so no post-processor can flatten the paragraph
 * structure the model was asked to produce.
 */
export function perParagraph(text: string, fn: (paragraph: string) => string): string {
  const raw = String(text ?? "");
  if (!/\n\s*\n/.test(raw)) return fn(raw);
  return splitParagraphs(raw)
    .map((p) => fn(p).trim())
    .filter(Boolean)
    .join("\n\n");
}
