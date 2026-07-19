// Citation/book-name fail-safe.
//
// History:
// On 2026-04-27 Paige flagged that an AI-generated heat-hat description cited
// "Chapter 4: The Truth About Deep Conditioners" — a chapter that does NOT
// exist in her book. The model invented it because the persona prompt asked
// for chapter citations.
//
// Resolution (2026-04-27, Paige): remove book references from the AI surface
// entirely. The manuscript stays the only source of truth (delivered via RAG)
// but the assistant must NEVER name "How To Love Your Afro" and must NEVER
// emit a "Read more — …" citation line in user-facing output. The chapter
// list remains here for internal RAG metadata only — it is not surfaced.
//
// All AI output is passed through `sanitiseChapterCitations` (and its deep
// variant) which strips any book name or citation line that slips through.

export interface BookChapter {
  number: number;
  title: string;
}

// Internal-only chapter list. Used by RAG retrieval for metadata. Never
// rendered to the user.
export const BOOK_CHAPTERS: BookChapter[] = [
  { number: 2, title: "Learning to Love Your Natural Hair" },
  { number: 8, title: "Your Hair – The Basics" },
  { number: 9, title: "Trichology vs Dermatology" },
  { number: 10, title: "Partner with a Professional" },
  { number: 11, title: "Styling: Best Practices" },
  { number: 12, title: "Scalp Health First" },
  { number: 13, title: "Building Your Wash Day Routine" },
  { number: 14, title: "Moisture Retention" },
];

// Authoritative appendix bolted onto the persona. The model is forbidden from
// naming the source manuscript or emitting "Read more — …" lines.
export const CITATION_BAN_PROMPT = `HOW TO USE THE SOURCE MATERIAL
The manuscript passages provided to you are your private knowledge base — draw the underlying guidance from them when it fits the user's situation, then blend it with your own AI-driven rationale personalised to their profile. Speak the advice directly, in STRAND's voice, as if the reasoning is your own.

Do not name the book, its author, its publisher, chapter titles, or page numbers on the surface, and do not emit "Read more — …" lines or "as the book says" framings. The user should experience the output as tailored, science-backed guidance — not as quotations from a source.`;

// Backwards-compat alias — older imports may still reference this name.
export const CHAPTER_WHITELIST_PROMPT = CITATION_BAN_PROMPT;

// Strip any "Read more — …" line. Accepts em-dash, en-dash, or hyphen.
// Matches both the canonical format and common minor variants.
const CITATION_LINE = /^[ \t]*Read\s+more\s*[\u2010-\u2015\-:]\s*[^\n]*$/gim;

// Strip any inline mention of the book name or its author/publisher. We
// remove the phrase and tidy surrounding punctuation/whitespace so the
// sentence stays readable. Handles common variants ("the book", combined
// "from How To Love Your Afro by Paige Lewin", etc.).
const BOOK_NAME = /\bHow\s+To\s+Love\s+Your\s+Afro\b/gi;
const AUTHOR_NAME = /\bPaige\s+Lewin\b/gi;
const PUBLISHER_NAME = /\bBloomsbury(?:\s+Publishing)?\b/gi;

// "as written in the book", "according to the book", "the book covers …" —
// strip the leading framing phrase so the advice still reads naturally.
const BOOK_FRAMING = /\b(?:as\s+(?:written|covered|noted|explained)\s+in\s+the\s+book|according\s+to\s+the\s+book|the\s+book\s+(?:says|covers|recommends|explains|notes))\b[,]?\s*/gi;

// "(see Chapter 13, p.155)" / "Chapter 13, p.155." — strip parenthetical or
// trailing chapter/page references that aren't on a "Read more" line.
const CHAPTER_INLINE = /\s*[\(\[]?\s*(?:see\s+)?Chapter\s+\d+\s*(?::\s*[^,\)\]\.\n]+)?(?:\s*,\s*p\.?\s*\d+[a-z]?)?\s*[\)\]]?\s*\.?/gi;

export function sanitiseChapterCitations(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = text;

  // 1. Remove full "Read more — …" lines outright.
  cleaned = cleaned.replace(CITATION_LINE, "");

  // 2. Strip authorship/publisher/title mentions.
  cleaned = cleaned.replace(BOOK_FRAMING, "");
  cleaned = cleaned.replace(BOOK_NAME, "");
  cleaned = cleaned.replace(AUTHOR_NAME, "");
  cleaned = cleaned.replace(PUBLISHER_NAME, "");

  // 3. Strip inline "Chapter X, p.Y" references.
  cleaned = cleaned.replace(CHAPTER_INLINE, "");

  // 4. Tidy up: collapse leftover spaces/punctuation and blank lines.
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n");

  return cleaned.trimEnd();
}

// Convenience: walk an arbitrary value and sanitise every string leaf in
// place (returns a new value, does not mutate). Use this on AI JSON
// responses before sending them to the client.
export function sanitiseChapterCitationsDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return sanitiseChapterCitations(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitiseChapterCitationsDeep(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitiseChapterCitationsDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
