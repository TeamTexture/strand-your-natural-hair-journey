// COMPOUND INGREDIENT LABELS
//
// Key-ingredient labels written by the analyser routinely combine two
// ingredients into one phrase, and sometimes aren't ingredients at all:
//
//   "Argan and Sweet Almond Oils"                                → two ingredients
//   "Polyquaternium-10 and Guar Hydroxypropyltrimonium Chloride" → two ingredients
//   "Sulfate-free amphoteric surfactant system"                  → a descriptive phrase
//   "Mild surfactant concentration"                              → a descriptive phrase
//
// Sending the whole phrase to the explainer treats it as a single INCI name,
// which is how junk gets written into a glossary every user reads. Instead we
// split the label into candidate parts, look each part up independently, and
// tokenise only the parts that resolve — the connecting words stay plain text.

/** Separators that join two ingredient names inside one label. */
const SPLIT_RE = /\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*/gi;

/** Words that mark a label as a description of a formula, not an ingredient. */
const DESCRIPTIVE_MARKERS =
  /\b(system|systems|concentration|concentrations|blend|blends|complex|profile|balance|content|level|levels|combination|matrix|formula|formulation|ratio|percentage|dose|dosage|absence|presence|lack)\b/i;

export interface LabelPart {
  /** Text exactly as it appears in the label. */
  text: string;
  /** Name to look up — may carry a restored shared suffix ("Argan Oil"). */
  lookup: string;
  /** False for connecting words like "and" that we re-emit as plain text. */
  candidate: boolean;
}

const singularise = (word: string) => {
  if (/(?:ss|us|is)$/i.test(word)) return word;
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|ses)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
};

/** True when a phrase could plausibly be one cosmetic ingredient name. */
export function looksLikeIngredient(raw: string): boolean {
  const text = (raw ?? "").trim();
  if (text.length < 3) return false;
  if (DESCRIPTIVE_MARKERS.test(text)) return false;
  if (text.split(/\s+/).length > 5) return false;
  return true;
}

/**
 * Splits a label into parts, preserving the separators as plain-text pieces.
 *
 * Shared-suffix handling: "Argan and Sweet Almond Oils" means "Argan Oil" and
 * "Sweet Almond Oil". When the FINAL part ends in a plural noun ("Oils",
 * "Butters", "Extracts"), the singular of that noun is appended to the earlier
 * parts before lookup, and the final part's own plural is singularised.
 */
export function splitCompoundLabel(label: string): LabelPart[] {
  const text = (label ?? "").trim();
  if (!text) return [];

  // Descriptive phrases are never split or looked up — they are prose.
  if (DESCRIPTIVE_MARKERS.test(text)) {
    return [{ text, lookup: text, candidate: false }];
  }

  // Walk the separators so the connecting words survive as plain text.
  const pieces: LabelPart[] = [];
  let cursor = 0;
  SPLIT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPLIT_RE.exec(text))) {
    const chunk = text.slice(cursor, m.index);
    if (chunk.trim()) pieces.push({ text: chunk, lookup: chunk.trim(), candidate: true });
    pieces.push({ text: m[0], lookup: m[0], candidate: false });
    cursor = m.index + m[0].length;
  }
  const tail = text.slice(cursor);
  if (tail.trim()) pieces.push({ text: tail, lookup: tail.trim(), candidate: true });

  const candidates = pieces.filter((p) => p.candidate);
  if (candidates.length <= 1) {
    return pieces.map((p) => (p.candidate ? { ...p, candidate: looksLikeIngredient(p.lookup) } : p));
  }

  // Shared trailing noun: take it from the LAST candidate and lend it back.
  const last = candidates[candidates.length - 1];
  const lastWords = last.lookup.split(/\s+/);
  const lastWord = lastWords[lastWords.length - 1] ?? "";
  const singular = singularise(lastWord);
  const isSharedPlural = singular.toLowerCase() !== lastWord.toLowerCase() && singular.length >= 3;

  if (isSharedPlural) {
    for (const part of candidates) {
      if (part === last) {
        part.lookup = [...lastWords.slice(0, -1), singular].join(" ");
      } else if (!new RegExp(`\\b${singular}s?$`, "i").test(part.lookup)) {
        part.lookup = `${part.lookup} ${singular}`;
      }
    }
  }

  return pieces.map((p) => (p.candidate ? { ...p, candidate: looksLikeIngredient(p.lookup) } : p));
}

/**
 * Inline phonetic, bracketed, for LIST items only — never flowing prose.
 * Returns null where no phonetic exists, so we never render empty brackets.
 */
export function bracketPhonetic(phonetic: string | null | undefined): string | null {
  const text = (phonetic ?? "").trim();
  if (!text) return null;
  return `(${text.replace(/^[([]|[)\]]$/g, "").trim()})`;
}
