// TERMINOLOGY GUARD — the author's own lexicon, extracted from the manuscript
// ===========================================================================
// The author takes explicit positions on contested words. Chapter 14: the only
// thing that can give hair moisture is water, and conditioning shampoos are
// better described as conditioning than moisturising. Chapter 1 is entirely
// about her precise use of language.
//
// The lexicon lives in `public.manuscript_terminology`, one row per term, each
// carrying the author's stated position AND the verbatim quote it was extracted
// from. Nothing in that table is written by hand: entries are extracted from
// chapters 1 and 14 and dropped unless the quote is present in the manuscript.
// The author can review, correct or deactivate any row from the admin audit
// page.
//
// This module reads the lexicon and enforces it deterministically on generated
// copy. It contains NO hair care copy of its own.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface LexiconEntry {
  term: string;
  author_position: string;
  reserved_for: string | null;
  banned_phrasings: string[];
  chapter: number;
  page_start: number | null;
  page_end: number | null;
  source_quote: string;
}

export interface TerminologyViolation {
  claim: string;
  reason: string;
  rule: string;
}

let cache: { rows: LexiconEntry[]; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Load the active lexicon. Never throws — an empty lexicon disables the guard. */
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
      .select("term, author_position, reserved_for, banned_phrasings, chapter, page_start, page_end, source_quote")
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
 * Prompt block for the writer: the author's positions, in her own recorded
 * words. Metadata (chapter/page) is withheld — the citation ban stands.
 */
export function terminologyBlock(rows: LexiconEntry[]): string {
  if (!rows.length) return "";
  const lines = rows.map(
    (r) =>
      `- "${r.term}": ${r.author_position}${
        r.reserved_for ? ` She reserves it for: ${r.reserved_for}.` : ""
      }`,
  );
  return `HER TERMINOLOGY — use these words exactly as she does. A common industry synonym is a defect:\n${lines.join("\n")}`;
}

const sentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Deterministic guard. For every lexicon entry that reserves a word for a
 * specific thing, any sentence that applies one of the author's reserved
 * phrasings to something OTHER than that thing is rejected.
 *
 * This is the specific fix for "glycerin hydrates high-porosity strands":
 * "hydrates" is reserved for water, the subject of the sentence is an
 * ingredient, so the sentence cannot be served.
 */
export function checkTerminology(
  text: string,
  rows: LexiconEntry[],
): TerminologyViolation[] {
  const out: TerminologyViolation[] = [];
  if (!text.trim() || !rows.length) return out;

  for (const row of rows) {
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
      // Allowed when the sentence is about the thing the author reserves the
      // word for, or when it explicitly denies/limits the claim.
      const attributedCorrectly = reserved.some((r) => l.includes(r));
      const negated = /\b(not|never|no|cannot|can't|doesn't|does not|only)\b/.test(l);
      if (attributedCorrectly || negated) continue;
      out.push({
        claim: s,
        reason:
          `Uses "${hit}" of something other than ${row.reserved_for}. ${row.author_position}`,
        rule: `terminology:${row.term}`,
      });
    }
  }
  return out;
}

/** Convenience: load the lexicon and check in one call. */
export async function verifyTerminology(text: string): Promise<TerminologyViolation[]> {
  return checkTerminology(text, await loadLexicon());
}
