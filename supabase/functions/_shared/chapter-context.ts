// WHOLE-CHAPTER MANUSCRIPT CONTEXT
// =================================
// 2026-08-09, at the author's instruction. Fragment (top-k) retrieval was the
// root cause of the fidelity failures: the model received a few hundred words
// of a chapter, had partial context, and filled the gaps from general industry
// knowledge — which is exactly what the book exists to correct.
//
// The whole manuscript is only ~77,700 tokens, so for every advice surface we
// now pass the AUTHORITATIVE CHAPTERS IN FULL instead of fragments.
//
// Chapter 1 (THE POWER OF LANGUAGE) is included in EVERY hair care generation:
// it governs the author's precise use of language, and terminology error is the
// failure mode being fixed.
//
// Chapter titles/headings are metadata only. They are never rendered into the
// prompt and never surfaced to the user (2026-04-27 citation ban stands).

declare const Deno: { env: { get(key: string): string | undefined } };

/** Every surface that generates advice, guidance or explanation. */
export type SurfaceKey =
  | "wash-day-tip"
  | "wash-day-steps"
  | "wash-day-observation"
  | "goal-tip"
  | "routine-tips"
  | "style-tip"
  | "brand-product-guidance"
  | "product-analyse"
  | "product-analyse-url"
  | "tool-analyse-url"
  | "tool-match-score"
  | "ingredient-analysis"
  | "ingredient-profile"
  | "ingredient-explainer"
  | "hair-strand-summary"
  | "heat-treatment-rationale"
  | "nutrition-plan"
  | "meal-ideas"
  | "blood-ai-summary"
  | "blood-change-analysis"
  | "journal-encouragement";

/** Chapter 1 governs terminology; it is mandatory everywhere. */
export const LANGUAGE_CHAPTER = 1;

/**
 * Authoritative chapters per surface, passed IN FULL.
 *
 * Chapter numbers, as verified against the running headers in the manuscript
 * body on 2026-08-09:
 *   1 THE POWER OF LANGUAGE            2 LEARNING TO LOVE YOUR NATURAL HAIR
 *   3 BEWARE OF THE 'CURL DEFINITION' TRAP
 *   4 SETTING REALISTIC GOALS          5 TURNING HAIR CARE INTO SELF-CARE
 *   6 NATURAL HAIR AND OUR ENVIRONMENTS 7 NATURAL HAIR AND DATING
 *   8 YOUR HAIR – THE BASICS           9 TRICHOLOGY VS DERMATOLOGY
 *  10 PARTNER WITH A PROFESSIONAL     11 STYLING: BEST PRACTICES
 *  12 SCALP HEALTH FIRST              13 BUILDING YOUR WASH DAY ROUTINE
 *  14 MOISTURE RETENTION              15 (title unverified — ingredients)
 *  16 (title unverified — hair growth/length retention)
 *  17 (title unverified — treatments)  18 (title unverified — colour)
 */
export const SURFACE_CHAPTERS: Record<SurfaceKey, number[]> = {
  "wash-day-tip": [13, 14],
  "wash-day-steps": [13, 14, 12],
  "wash-day-observation": [13, 14],
  "goal-tip": [4, 13, 14, 16],
  "routine-tips": [13, 14, 11, 12],
  "style-tip": [11, 12, 14],
  "brand-product-guidance": [13, 14, 15],
  "product-analyse": [13, 14, 15],
  "product-analyse-url": [13, 14, 15],
  "tool-analyse-url": [13, 11],
  "tool-match-score": [13, 11],
  "ingredient-analysis": [15, 14],
  "ingredient-profile": [15, 14],
  "ingredient-explainer": [15, 14],
  "hair-strand-summary": [8, 12, 14, 16],
  "heat-treatment-rationale": [13, 14, 17],
  "nutrition-plan": [8, 16],
  "meal-ideas": [8, 16],
  "blood-ai-summary": [8, 9],
  "blood-change-analysis": [8, 9],
  "journal-encouragement": [2, 4],
};

export interface ChapterChunk {
  chapter: number;
  chapter_title: string | null;
  section_heading: string | null;
  page_start: number | null;
  page_end: number | null;
  body: string;
  token_count: number | null;
}

export interface ChapterContext {
  /** Prompt-ready manuscript text (bodies only — no titles, no page numbers). */
  text: string;
  /** Chapters actually loaded. */
  chapters: number[];
  chunks: number;
  approxTokens: number;
}

const cache = new Map<string, ChapterContext>();

/** Resolve the chapter list for a surface, always including chapter 1. */
export function chaptersForSurface(surface: SurfaceKey): number[] {
  const set = new Set<number>([LANGUAGE_CHAPTER, ...(SURFACE_CHAPTERS[surface] ?? [])]);
  return [...set].sort((a, b) => a - b);
}

/**
 * Load the given chapters IN FULL, in reading order, via the service-role
 * `manuscript_chapters` RPC. Returns empty text (never throws) when the
 * manuscript is unreachable — callers must treat empty text as "no grounding"
 * and refuse to generate hair care claims.
 */
export async function loadChapters(chapters: number[]): Promise<ChapterContext> {
  const key = chapters.slice().sort((a, b) => a - b).join(",");
  const cached = cache.get(key);
  if (cached) return cached;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return { text: "", chapters: [], chunks: 0, approxTokens: 0 };
  }

  try {
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("manuscript_chapters", {
      chapter_numbers: chapters,
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ChapterChunk[];
    if (rows.length === 0) {
      return { text: "", chapters: [], chunks: 0, approxTokens: 0 };
    }

    // Bodies only, joined in reading order. Section headings are structural
    // signal and safe to include (they are the author's own words) but chapter
    // titles and page numbers are withheld so nothing can be cited.
    const parts: string[] = [];
    let lastHeading: string | null = null;
    for (const r of rows) {
      if (r.section_heading && r.section_heading !== lastHeading) {
        parts.push(`\n### ${r.section_heading}\n`);
        lastHeading = r.section_heading;
      }
      parts.push(r.body);
    }
    const text = parts.join("\n\n");
    const ctx: ChapterContext = {
      text,
      chapters: [...new Set(rows.map((r) => r.chapter))].sort((a, b) => a - b),
      chunks: rows.length,
      approxTokens: rows.reduce(
        (a, r) => a + (r.token_count ?? Math.ceil(r.body.length / 4)),
        0,
      ),
    };
    if (cache.size > 24) cache.clear();
    cache.set(key, ctx);
    return ctx;
  } catch (e) {
    console.error(
      JSON.stringify({ event: "chapter_context_failed", chapters, error: String(e) }),
    );
    return { text: "", chapters: [], chunks: 0, approxTokens: 0 };
  }
}

/** Convenience: full chapter context for a surface (chapter 1 always included). */
export function loadSurfaceChapters(surface: SurfaceKey): Promise<ChapterContext> {
  return loadChapters(chaptersForSurface(surface));
}

/** The prompt block wrapping full-chapter source text. */
export function renderChapterBlock(ctx: ChapterContext): string {
  if (!ctx.text) return "";
  return `SOURCE MATERIAL — COMPLETE CHAPTERS (your ONLY permitted source of hair care fact):

${ctx.text}

END OF SOURCE MATERIAL.`;
}

/** The fidelity contract appended whenever full chapters are supplied. */
export const FIDELITY_RULE =
  `MANUSCRIPT FIDELITY — ABSOLUTE, OVERRIDES EVERY OTHER INSTRUCTION:
1. Every hair care claim, term, mechanism, cause and instruction you write MUST be supported by the SOURCE MATERIAL above. If the source does not support it, do not write it.
2. NEVER fall back on general hair care knowledge, industry convention or your training data. The source material exists to correct widespread industry misinformation, so outside knowledge is a defect, not a fallback.
3. Say LESS rather than filling a gap. A shorter answer that is fully supported is always correct; a longer answer containing one unsupported claim is a failure.
4. NEVER name, invent or infer a book, author, chapter title, section name, page number or quotation. If you are unsure of a label, omit it entirely.
5. Do not quote the source verbatim. Take its reasoning and guidance and express it in your own words — without ever asserting something it does not say.
6. Use the source's own terminology exactly as it does. Do not substitute a common industry synonym for the source's chosen term.`;
