/**
 * Transcript formatting.
 *
 * Voice notes come back from transcription as one unbroken block of speech —
 * no paragraphs, no line breaks. Read raw it is word vomit. These helpers turn
 * that block into readable paragraphs and produce a short preview for cards.
 *
 * Nothing here rewrites the member's words: it only inserts breaks between
 * sentences that are already there.
 */

/** Sentences per paragraph when no natural discourse break is found. */
const SENTENCES_PER_PARAGRAPH = 3;

/**
 * Spoken discourse markers that almost always start a new thought. When a
 * sentence opens with one of these, we break the paragraph there instead of
 * waiting for the sentence count.
 */
const NEW_THOUGHT_OPENERS = [
  "so",
  "and then",
  "then",
  "but",
  "however",
  "also",
  "another thing",
  "one thing",
  "overall",
  "honestly",
  "basically",
  "anyway",
  "next time",
  "the only thing",
  "i think",
  "i also",
  "i'm also",
  "im also",
  "i genuinely",
  "on the other hand",
  "in terms of",
  "as for",
  "after that",
  "afterwards",
  "finally",
  "lastly",
];

/** Splits text into sentences, keeping terminal punctuation attached. */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // Break after . ! ? followed by whitespace + a capital / quote / digit.
  // Guards common abbreviations so "Dr. Smith" or "e.g. this" stay intact.
  const parts = cleaned
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|approx|no)\.\s/gi, "$1<abbr> ")
    .split(/(?<=[.!?…])\s+(?=["'“‘(]?[A-Z0-9])/)
    .map((s) => s.replace(/<abbr>/g, ".").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

function startsNewThought(sentence: string): boolean {
  const opener = sentence.toLowerCase().replace(/^["'“‘(]+/, "");
  return NEW_THOUGHT_OPENERS.some(
    (marker) => opener.startsWith(`${marker} `) || opener.startsWith(`${marker},`),
  );
}

/**
 * Groups a transcript into paragraphs. Existing blank-line breaks are always
 * respected; long single-block speech is grouped by sentence, breaking early at
 * a discourse marker so each paragraph is one thought.
 */
export function toParagraphs(text: string | null | undefined): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];

  // Respect breaks the member (or an earlier edit) already put in.
  const existing = raw.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  if (existing.length > 1) return existing;
  const singleBlock = existing[0] ?? raw;
  if (/\n/.test(singleBlock)) {
    const lines = singleBlock.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines;
  }

  const sentences = splitSentences(singleBlock);
  if (sentences.length <= 2) return [singleBlock.replace(/\s+/g, " ").trim()];

  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  };

  sentences.forEach((sentence, i) => {
    // Break before a new thought, but never leave a one-sentence orphan at the
    // very start and never break on the first sentence.
    if (i > 0 && current.length >= 2 && startsNewThought(sentence)) flush();
    current.push(sentence);
    if (current.length >= SENTENCES_PER_PARAGRAPH) flush();
  });
  flush();

  // A trailing single short sentence reads better joined to the paragraph above.
  if (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    if (splitSentences(last).length === 1 && last.length < 60) {
      paragraphs[paragraphs.length - 2] = `${paragraphs[paragraphs.length - 2]} ${last}`;
      paragraphs.pop();
    }
  }

  return paragraphs;
}

/** Longest preview shown on a wash day card before "See all". */
export const TRANSCRIPT_PREVIEW_CHARS = 220;

export interface TranscriptPreview {
  /** The text to render on the card. */
  text: string;
  /** True when the full transcript is longer than the preview. */
  truncated: boolean;
  /** Approximate word count of the full transcript, for the "See all" label. */
  words: number;
}

/**
 * Builds a card preview: whole sentences up to roughly the character budget, so
 * the preview never cuts off mid-word or mid-thought.
 */
export function transcriptPreview(
  text: string | null | undefined,
  limit = TRANSCRIPT_PREVIEW_CHARS,
): TranscriptPreview | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const words = raw.split(/\s+/).length;
  if (raw.length <= limit) return { text: raw, truncated: false, words };

  const sentences = splitSentences(raw);
  let out = "";
  for (const sentence of sentences) {
    if (out && (`${out} ${sentence}`).length > limit) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  if (!out) {
    // One very long sentence — cut on a word boundary and ellipsise.
    const cut = raw.slice(0, limit);
    out = `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : limit).trim()}…`;
  }
  return { text: out, truncated: true, words };
}

/* ------------------------------------------------------------------ */
/* Light clean-up of spoken transcripts                                */
/* ------------------------------------------------------------------ */
//
// Transcription returns speech verbatim: filler words, false starts and
// stammered repeats, often with almost no punctuation. This tidies the text for
// reading WITHOUT rewriting it — her words, her order, her voice. Nothing is
// paraphrased, reordered or summarised, and the raw transcript is always kept
// alongside so the original record is never lost.

/** Filler words removed when they are standing alone as filler. */
const FILLER_WORDS = ["um", "umm", "uh", "uhh", "erm", "er", "ah", "hmm", "mm", "mmm"];

/**
 * Cleans a spoken transcript: drops filler, collapses stammered repeats,
 * removes false starts and normalises spacing/punctuation.
 */
export function cleanTranscript(text: string | null | undefined): string {
  let out = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!out) return "";

  // Bare filler words, wherever they sit.
  const fillerRe = new RegExp(`\\b(?:${FILLER_WORDS.join("|")})\\b[,.]?\\s*`, "gi");
  out = out.replace(fillerRe, "");

  // "basically" and filler "like" — only when used as filler, i.e. followed by
  // a comma or sitting between two clauses. "I like this" and "like a combo"
  // (comparison) are left alone.
  out = out.replace(/\b(?:basically|literally)\b,?\s*/gi, "");
  out = out.replace(/,\s*like,\s*/gi, ", ");
  out = out.replace(/\bit'?s\s+like,\s*/gi, "it's ");
  out = out.replace(/\byou know\b,\s*/gi, "");
  out = out.replace(/\bsort of\b,\s*/gi, "");
  out = out.replace(/\bkind of\b,\s*/gi, "");
  out = out.replace(/\bI mean\b,\s*/gi, "");

  // Stammered repeats: "the the", "I I", "and and".
  out = out.replace(/\b([A-Za-z']+)(\s+\1\b)+/gi, "$1");

  // False starts: a one- or two-word fragment abandoned before a dash.
  out = out.replace(/\b[A-Za-z']+\s?[-–—]{1,2}\s+/g, "");

  // Spacing and punctuation hygiene.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=[A-Za-z])/g, "$1 ")
    .replace(/,\s*,+/g, ",")
    .replace(/\.\s*\.(?!\.)/g, ".")
    .replace(/^\s*[,.;:]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Capitalise the opening letter of each sentence that lost it, and make sure
  // the note ends on a full stop.
  out = out.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  if (/[A-Za-z0-9)]$/.test(out)) out = `${out}.`;

  return out;
}
