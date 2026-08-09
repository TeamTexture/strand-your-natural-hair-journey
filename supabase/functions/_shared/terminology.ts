// TERMINOLOGY LEXICON — an EXPLANATION set, not a blocklist
// =========================================================
// 2026-08-09, at the author's correction.
//
// The app's job is not to censor a brand's language or refuse to engage with
// it. It is to explain the nuance so the member understands what is actually
// happening. In her own words:
//
//   "If a brand says this hydrates — no. What it does is create a barrier
//    around the hair that helps to reduce or slow the evaporation of the
//    moisture for longer, which keeps your hair hydrated for longer."
//
// So every lexicon row now carries three things:
//   term                  the word
//   loose_usage           how it is commonly or loosely used
//   accurate_explanation  the accurate explanation, in her framing
//
// When generated output or a brand claim uses a term loosely, the surface
// renders the accurate explanation BRIEFLY alongside it. Nothing is rejected,
// no product goes unnamed, and no one is lectured.
//
// The lexicon lives in `public.manuscript_terminology`, extracted from the
// manuscript (chapters 1 and 14) — this module contains no hair care copy of
// its own and never invents an explanation.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface LexiconEntry {
  term: string;
  author_position: string;
  reserved_for: string | null;
  /** Loose-usage triggers: the phrasings that signal the word is being used loosely. */
  banned_phrasings: string[];
  loose_usage: string | null;
  accurate_explanation: string | null;
  mode: string | null;
  chapter: number;
  page_start: number | null;
  page_end: number | null;
  source_quote: string;
}

/** A nuance note: the loose usage that was spotted, and the brief explanation
 *  the member sees alongside it. Never a rejection. */
export interface TerminologyNote {
  term: string;
  /** The sentence that used the term loosely. */
  claim: string;
  /** The phrasing that triggered the note. */
  phrasing: string;
  /** The accurate explanation, in her framing. Rendered as-is. */
  explanation: string;
}

let cache: { rows: LexiconEntry[]; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Load the active lexicon. Never throws — an empty lexicon disables the notes. */
export async function loadLexicon(): Promise<LexiconEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return [];
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db
      .from("manuscript_terminology")
      .select(
        "term, author_position, reserved_for, banned_phrasings, loose_usage, accurate_explanation, mode, chapter, page_start, page_end, source_quote",
      )
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LexiconEntry[];
    cache = { rows, at: Date.now() };
    return rows;
  } catch (e) {
    console.warn("[terminology] lexicon unavailable:", e);
    return [];
  }
}

/**
 * Prompt block for the writer: her positions and, where the word is commonly
 * used loosely, the accurate explanation she gives for it. The instruction is
 * to EXPLAIN, not to avoid. Metadata (chapter/page) is withheld — the citation
 * ban stands.
 */
export function terminologyBlock(rows: LexiconEntry[]): string {
  if (!rows.length) return "";
  const lines = rows.map((r) => {
    const parts = [`- "${r.term}": ${r.author_position}`];
    if (r.loose_usage) parts.push(`  Commonly used loosely as: ${r.loose_usage}`);
    if (r.accurate_explanation) parts.push(`  The accurate explanation, in her words: ${r.accurate_explanation}`);
    return parts.join("\n");
  });
  return `HER TERMINOLOGY — EXPLAIN THE NUANCE, DO NOT CENSOR IT.
Where one of these words is used loosely — by you, by a brand, or on a product page — do not delete it and do not refuse to engage with it. Say briefly what is actually happening instead, in her framing. One sentence. Never lecture, never take a swipe at a brand, never call a claim false.
${lines.join("\n")}`;
}

const sentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Spot loose usage and return the EXPLANATION for it. Nothing is rejected.
 *
 * A note is raised when a sentence applies one of her loosely-used phrasings
 * to something other than the thing she reserves the word for — e.g. a product
 * described as hydrating, where she reserves hydrating for water. If the
 * sentence already carries the accurate explanation (it names the mechanism,
 * or explicitly limits the claim) no note is needed: the nuance is there.
 */
export function explainTerminology(
  text: string,
  rows: LexiconEntry[],
): TerminologyNote[] {
  const out: TerminologyNote[] = [];
  if (!text.trim() || !rows.length) return out;
  const seen = new Set<string>();

  for (const row of rows) {
    const explanation = (row.accurate_explanation ?? "").trim();
    if (!explanation) continue;
    const phrasings = (row.banned_phrasings ?? []).filter((p) => p && p.trim().length > 2);
    if (!phrasings.length || !row.reserved_for) continue;
    const reserved = row.reserved_for
      .toLowerCase()
      .split(/[,/]| or /)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);

    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      const hit = phrasings.find((p) => new RegExp(`\\b${escape(p.toLowerCase())}`).test(l));
      if (!hit) continue;
      // Already accurate: it is about the thing she reserves the word for, it
      // limits the claim, or it already states the mechanism.
      const attributedCorrectly = reserved.some((r) => l.includes(r));
      const limited = /\b(not|never|no|cannot|can't|doesn't|does not|only)\b/.test(l);
      const alreadyExplained =
        /\b(coats?|coating|seals?|slows?|barrier|evaporat\w*|film|holds? (?:it|that|the water) in|keeps? .* for longer)\b/.test(l);
      if (attributedCorrectly || limited || alreadyExplained) continue;
      if (seen.has(row.term)) continue;
      seen.add(row.term);
      out.push({ term: row.term, claim: s, phrasing: hit, explanation });
      break;
    }
  }
  return out;
}

/** Convenience: load the lexicon and produce the notes in one call. */
export async function terminologyNotes(text: string): Promise<TerminologyNote[]> {
  return explainTerminology(text, await loadLexicon());
}
