// CANONICAL CHAPTER LIST — How To Love Your Afro by Paige Lewin.
//
// This is the ONLY allow-list of chapters that may ever appear in a
// "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]"
// citation rendered to the user.
//
// Why this exists:
// On 2026-04-27 Paige flagged that an AI-generated heat-hat tool description
// cited "Chapter 4: The Truth About Deep Conditioners" — a chapter that does
// NOT exist in her book. The model invented it because the persona prompt
// asks for chapter citations but had never been told which chapters actually
// exist. From now on, citations work on a strict whitelist + server-side
// sanitiser. If a chapter number or title is not in this map, the entire
// citation line is stripped from the response before it ever reaches the
// user.
//
// To add a new chapter, add it here AND only here. Do not add chapters in
// individual edge functions or knowledge files.

export interface BookChapter {
  number: number;
  title: string;
}

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

const CHAPTER_BY_NUMBER = new Map(BOOK_CHAPTERS.map((c) => [c.number, c]));

// Normalise a title for comparison: lower-case, collapse whitespace,
// normalise dash variants (em-dash, en-dash, hyphen) and strip trailing
// punctuation. The book uses an en-dash in "Your Hair – The Basics" so we
// must accept the model returning a plain hyphen.
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-") // any unicode dash → ascii hyphen
    .replace(/[.,;:!?'"`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Authoritative appendix to bolt onto the persona prompt. Lists the only
// allowed chapters and the EXACT format. Persona body itself is locked
// verbatim (see _shared/strand-persona.ts) so this lives separately.
export const CHAPTER_WHITELIST_PROMPT = `AUTHORITATIVE CHAPTER LIST — How To Love Your Afro
The book has a fixed table of contents. You may ONLY cite a chapter from this list. If the guidance does not map to one of these chapters, omit the "Read more — …" line entirely. Never invent a chapter number or title. Never paraphrase a title.

${BOOK_CHAPTERS.map((c) => `Chapter ${c.number}: ${c.title}`).join("\n")}

Format reminder (must be exact, on its own line, at the end of the user-facing copy):
Read more — How To Love Your Afro, Chapter [X]: [Chapter Title], p.[page]

Citing a chapter that is not on the list above is a critical failure. When in doubt, omit the citation.`;

// Strip any "Read more — …" citation that does not match the whitelist.
// Accepts em-dash, en-dash, or hyphen between "Read more" and the rest.
// Matches both the canonical format and common minor variants the model
// might emit (extra spaces, lowercase "chapter", missing page, etc.).
//
// If the chapter number exists in the whitelist AND the title matches
// (case-insensitively, dash-insensitively), the line is kept. Otherwise the
// entire line is removed and surrounding blank lines are tidied up.
const CITATION_LINE = /^[ \t]*Read\s+more\s*[\u2010-\u2015\-]\s*How\s+To\s+Love\s+Your\s+Afro\s*,\s*Chapter\s+(\d+)\s*:\s*([^,\n]+?)\s*(?:,\s*p\.?\s*\d+[a-z]?)?\s*\.?\s*$/gim;

export function sanitiseChapterCitations(text: string | null | undefined): string {
  if (!text) return "";
  const cleaned = text.replace(CITATION_LINE, (match, numStr: string, titleStr: string) => {
    const num = Number(numStr);
    const chapter = CHAPTER_BY_NUMBER.get(num);
    if (!chapter) return ""; // unknown chapter number → drop
    if (normaliseTitle(chapter.title) !== normaliseTitle(titleStr)) return ""; // wrong title → drop
    return match; // valid citation → keep as-is
  });
  // Tidy up: collapse 3+ newlines left behind by removed lines.
  return cleaned.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
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
