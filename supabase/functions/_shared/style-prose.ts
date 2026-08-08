// style-prose — prose-friendly rendering of style labels.
//
// Some legitimate style options carry a slash in their stored label because the
// style is known by two names ("Passion / rope twists"). The slash is correct in
// the picker and in the stored value, but it reads badly mid-sentence:
//   "...before you transition to your planned Passion / rope twists."
//
// This module rewrites the slash into prose ("passion or rope twists") for
// GENERATED COPY ONLY. The stored value and the picker label are never touched.

/** Prose form of a single style label. */
export function proseStyleLabel(label: string | null | undefined): string {
  const s = String(label ?? "").trim();
  if (!s) return "";
  // "Passion / rope twists" -> "Passion or rope twists"
  return s.replace(/\s*\/\s*/g, " or ").replace(/\s+/g, " ").trim();
}

/**
 * Rewrite any slashed style label inside a block of generated prose.
 * Only touches "word / word" pairs — never URLs, dates or fractions, which have
 * no surrounding spaces.
 */
export function proseStyleText(text: string | null | undefined): string {
  const s = String(text ?? "");
  if (!s) return "";
  return s.replace(/([A-Za-z]) \/ ([A-Za-z])/g, "$1 or $2");
}
