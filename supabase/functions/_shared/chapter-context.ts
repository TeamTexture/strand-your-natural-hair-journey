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
  | "journal-encouragement"
  | "daily-pattern-tip";

/** Chapter 1 governs terminology; it is mandatory everywhere. */
export const LANGUAGE_CHAPTER = 1;

/**
 * Authoritative chapters per surface, passed IN FULL.
 *
 * Chapter map verified by the author against the source PDF
 * (HTLYA_Manuscript_-_Final_2026.pdf) on 2026-08-09, then re-ingested from that
 * PDF the same day. Numbers in brackets are the printed chapter-title pages.
 * manuscript_chunks.page_start is the first page of BODY text, i.e. the title
 * page + 1, because chapter-title display pages carry no prose.

 *   1 The Power of Language (20)              2 Learning to Love Your Natural Hair (30)
 *   3 Beware of the 'Curl Definition' Trap (49) 4 Setting Realistic Goals (58)
 *   5 Turning Hair Care into Self-Care (65)   6 Natural Hair and Our Environments (75)
 *   7 Natural Hair and Dating (85)            8 Your Hair – The Basics (102)
 *   9 Trichology vs Dermatology (126)        10 Partner with a Professional (134)
 *  11 Styling: Best Practices (141)          12 Scalp Health First (149)
 *  13 Building Your Wash Day Routine (155)   14 Moisture Retention (170)
 *  15 Understanding Ingredients (184)        16 Length Retention (192)
 *  17 Treatments (198)                       18 Colouring (203)
 *
 * Author's topic → chapter rules (chapter 1 added automatically everywhere):
 *   wash day → 13, 14        length/retention → 16, 14
 *   scalp → 12, 13           ingredients/products → 15, 14
 *   styling/protective → 11, 14   treatments → 17, 14   colouring → 18
 */
export const SURFACE_CHAPTERS: Record<SurfaceKey, number[]> = {
  // Wash day guidance
  "wash-day-tip": [13, 14],
  "wash-day-steps": [13, 14],
  "wash-day-observation": [13, 14],
  // Goals: length/retention is the dominant recorded goal, but almost every goal
  // tip has to prescribe an action, and the actions live in the wash day chapter.
  // Without 13 the evidence set is definitional only and stage 3 rejects the
  // whole tip body, leaving a bare headline.
  "goal-tip": [16, 14, 13],
  // Routine spans wash day + styling
  "routine-tips": [13, 14, 11],
  // Styling and protective styles
  "style-tip": [11, 14],
  // Products and ingredients
  "brand-product-guidance": [15, 14],
  "product-analyse": [15, 14],
  "product-analyse-url": [15, 14],
  "ingredient-analysis": [15, 14],
  "ingredient-profile": [15, 14],
  "ingredient-explainer": [15, 14],
  // Tools are used in styling and wash day
  "tool-analyse-url": [11, 13],
  "tool-match-score": [11, 13],
  // Strand/scalp condition
  "hair-strand-summary": [12, 13],
  // Heat is a treatment
  "heat-treatment-rationale": [17, 14],
  // Ambiguous topic: chapter 1 + the single most specific chapter only
  "nutrition-plan": [16],
  "meal-ideas": [16],
  "blood-ai-summary": [8],
  "blood-change-analysis": [8],
  "journal-encouragement": [4],
  // The weekly daily-log pattern card: between-wash moisture and product
  // layering (14), the wash itself (13), and build-up on the scalp (12).
  "daily-pattern-tip": [14, 13, 12],
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
const rowCache = new Map<string, ChapterChunk[]>();

/** Resolve the chapter list for a surface, always including chapter 1. */
export function chaptersForSurface(surface: SurfaceKey): number[] {
  const set = new Set<number>([LANGUAGE_CHAPTER, ...(SURFACE_CHAPTERS[surface] ?? [])]);
  return [...set].sort((a, b) => a - b);
}

/**
 * The chapters IN FULL as individual rows WITH their metadata (chapter, title,
 * printed pages). Stage 1 of the grounded pipeline needs the metadata so the
 * evidence set can be attributed to a chapter and page without the model ever
 * being trusted to produce one. Never throws — returns [] when unreachable.
 */
export async function loadChapterRows(chapters: number[]): Promise<ChapterChunk[]> {
  const key = chapters.slice().sort((a, b) => a - b).join(",");
  const cached = rowCache.get(key);
  if (cached) return cached;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
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
    if (rows.length) {
      if (rowCache.size > 24) rowCache.clear();
      rowCache.set(key, rows);
    }
    return rows;
  } catch (e) {
    console.error(
      JSON.stringify({ event: "chapter_rows_failed", chapters, error: String(e) }),
    );
    return [];
  }
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
6. Use the source's own terminology exactly as it does. Do not substitute a common industry synonym for the source's chosen term.
7. HARD BANS — the source explicitly contradicts these, and a single instance fails the whole answer:
   - Do NOT say a product seals, locks or traps moisture (or hydration) in the hair, and do not use phrases like "moisture-sealing" or "seals it in". You MAY say a product creates a barrier around the moisture already in the hair and slows or reduces its evaporation, which keeps the hair hydrated for longer — that is her position.
   - Do NOT say a leave-in, cream, butter or styler hydrates, moisturises, adds or delivers moisture. Only water provides moisture.
   - Do NOT present LOC/LCO as a daily or necessary practice. It is to be avoided daily; weekly, after wash day, is fine.
   - Cleansing is TWO cleanses: the first focuses on the SCALP with a cleansing or all-purpose shampoo, using the pads of the fingers; the second uses a conditioning or moisturising shampoo and focuses on the HAIR. Do NOT reverse that.
   - Washing while in a protective style uses a scalp cleanser — a solution on cotton pads, or preformulated scalp cleansing pads — not general shampooing of the braids.
   - Do NOT tell anyone to use their nails on the scalp. Scalp agitation uses the pads of the fingertips.`;


// ---------------------------------------------------------------------------
// Source registry
// ---------------------------------------------------------------------------
//
// The fidelity fail-safe runs inside sanitiseAndLog, which is often called from
// a different scope than the one that built the grounding block. Rather than
// thread the source text through every function signature, the grounding
// builder records what it gave the model, keyed by function name, and the
// fail-safe reads it back. Chapters are fixed per surface, so the recorded text
// is the text that generation actually saw.

const lastSourceByFn = new Map<string, { text: string; chapters: number[] }>();

export function noteSourceText(fn: string, text: string, chapters: number[]): void {
  if (!text) return;
  if (lastSourceByFn.size > 32) lastSourceByFn.clear();
  lastSourceByFn.set(fn, { text, chapters });
}

export function lastSourceText(fn: string): { text: string; chapters: number[] } {
  return lastSourceByFn.get(fn) ?? { text: "", chapters: [] };
}
