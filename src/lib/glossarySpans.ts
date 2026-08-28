// Shared glossary term matcher for member-facing analysis prose.
//
// STANDING STANDARD (see CLAUDE.md): every technical hair/scalp/ingredient term
// in generated copy renders BOLD and TAPPABLE, opening the glossary explainer.
// This module is the single place that decides which spans of a sentence are
// glossary terms, so ingredient names ("Decyl glucoside"), ingredient families
// ("surfactants", "humectants") and hair-science concepts ("cuticle", "high
// porosity", "elasticity", "sebum") are all treated identically.
//
// Closed vocabulary still applies: a span only matches when it resolves to an
// existing `glossary_terms` row. Nothing is invented here.

export interface GlossarySpan {
  start: number;
  end: number;
  /** Canonical glossary display name to open the explainer with. */
  name: string;
  /** The exact text as it appeared, so the sentence still reads naturally. */
  text: string;
}

// A hyphen is a WORD SEPARATOR here, not part of the word: generated copy says
// "high-porosity strands" and "surfactant-heavy", and those must still resolve
// to "high porosity" / "surfactant". Only alphanumerics block a boundary.
const isWordChar = (ch: string | undefined) => Boolean(ch && /[0-9A-Za-z_]/.test(ch));

/** Lower-cased copy of `text` with hyphens flattened to spaces. Same LENGTH as
 *  the source, so span offsets map straight back onto the original string. */
const matchable = (text: string) => text.toLowerCase().replace(/[-\u2010\u2011\u2012\u2013]/g, " ");

/**
 * Finds glossary spans inside `text`.
 *
 * - `tokenNames` must be pre-sorted longest-first (useIngredientGlossary does
 *   this) so "high porosity" wins over "porosity".
 * - FIRST OCCURRENCE ONLY per term: a repeated word is tokenised once, so a
 *   paragraph never turns into a wall of chips.
 * - Simple plural tolerance ("surfactant" matches "surfactants") — the plural
 *   still resolves to the same glossary row, never a new definition.
 */
export function findGlossarySpans(
  text: string,
  tokenNames: string[],
  lookup: (name: string) => { display_name: string } | null,
): GlossarySpan[] {
  const source = String(text ?? "");
  if (!source.trim()) return [];
  const haystack = matchable(source);
  const spans: GlossarySpan[] = [];
  const claimed = new Set<string>();

  const overlaps = (start: number, end: number) =>
    spans.some((s) => !(end <= s.start || start >= s.end));

  for (const term of tokenNames) {
    const key = matchable(term).replace(/\s+/g, " ").trim();
    if (claimed.has(key)) continue;
    const row = lookup(term);
    if (!row) continue;

    // The term itself, then the naive plural — same row either way.
    const forms = key.endsWith("s") ? [key] : [key, `${key}s`, `${key}es`];
    let placed = false;
    for (const form of forms) {
      if (placed) break;
      let from = 0;
      while (from <= haystack.length) {
        const idx = haystack.indexOf(form, from);
        if (idx < 0) break;
        const end = idx + form.length;
        from = idx + 1;
        if (isWordChar(source[idx - 1]) || isWordChar(source[end])) continue;
        if (overlaps(idx, end)) continue;
        spans.push({ start: idx, end, name: row.display_name, text: source.slice(idx, end) });
        claimed.add(key);
        placed = true;
        break;
      }
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

export type GlossarySegment = { text: string; name?: string };

/** Splits `text` into plain / glossary segments in reading order. */
export function glossarySegments(
  text: string,
  tokenNames: string[],
  lookup: (name: string) => { display_name: string } | null,
): GlossarySegment[] {
  const source = String(text ?? "");
  const spans = findGlossarySpans(source, tokenNames, lookup);
  if (spans.length === 0) return source ? [{ text: source }] : [];
  const out: GlossarySegment[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) out.push({ text: source.slice(cursor, s.start) });
    out.push({ text: s.text, name: s.name });
    cursor = s.end;
  }
  if (cursor < source.length) out.push({ text: source.slice(cursor) });
  return out;
}
