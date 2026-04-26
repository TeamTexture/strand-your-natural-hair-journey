// Admin-only one-shot indexer for the manuscript RAG corpus.
// Audit PHASE_2_AUDIT.md §3 / §8 Step 6.
//
// Reads the manuscript markdown from the `manuscript` private storage
// bucket, chunks it (chapter → section → paragraph; ~500 tokens with
// ~50 token overlap), embeds each chunk with OpenAI
// text-embedding-3-small, inserts into manuscript_chunks. Idempotent:
// truncates the table at start, so re-runs are clean.
//
// Auth gates (BOTH must pass), same pattern as phase1-backfill-existing-rows:
//   1) body.confirm === "i-have-uploaded-the-manuscript"
//   2) caller authorisation, ANY of:
//      (a) Authorization bearer == SUPABASE_SERVICE_ROLE_KEY
//      (b) authenticated email matches PHASE2_ADMIN_EMAIL env (defaults
//          to PHASE1_ADMIN_EMAIL, then to info@texturetalks.co.uk)
//      (c) body.adminToken == BACKFILL_ADMIN_TOKEN env

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";

const CONFIRM_PHRASE = "i-have-uploaded-the-manuscript";
const DEFAULT_FOUNDER_EMAIL = "info@texturetalks.co.uk";

const MANUSCRIPT_BUCKET = "manuscript";
const MANUSCRIPT_OBJECT_KEY = "HTLYA_manuscript.md";

const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

// Chunking targets per audit §3.2.
const TARGET_CHARS = 1800;     // ~450 tokens at chars/4 heuristic
const MAX_CHARS = 2400;        // ~600 tokens
const OVERLAP_CHARS = 200;     // ~50 tokens

interface ParsedPage {
  page: number;
  text: string;
}

interface PendingChunk {
  chapter: number;
  chapter_title: string;
  section_heading?: string;
  page_start: number;
  page_end: number;
  body: string;
}

interface RequestBody {
  confirm?: string;
  adminToken?: string;
}

const numWord: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6,
  SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11,
  TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15,
  SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19, TWENTY: 20,
};

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function parsePages(md: string): ParsedPage[] {
  // Pages are demarcated by lines like `<!-- page 12 -->`.
  const out: ParsedPage[] = [];
  const lines = md.split("\n");
  let currentPage = 0;
  let buf: string[] = [];
  const flush = () => {
    if (currentPage > 0 && buf.length > 0) {
      out.push({ page: currentPage, text: buf.join("\n").trim() });
    }
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^<!--\s*page\s+(\d+)\s*-->\s*$/);
    if (m) {
      flush();
      currentPage = parseInt(m[1], 10);
      continue;
    }
    if (currentPage === 0) continue; // skip preamble before first page marker
    buf.push(line);
  }
  flush();
  return out;
}

interface ChapterAnchor {
  chapter: number;
  title: string;
  start_page: number;
}

/** Find chapter starts by scanning for "CHAPTER <WORD>" headings on each
 *  page. The actual chapter title is usually broken across multiple lines
 *  on the chapter's first page; we recover it from the running header on
 *  the *next* page. Falls back to "Chapter N" if recovery fails. */
function detectChapters(pages: ParsedPage[]): ChapterAnchor[] {
  const anchors: ChapterAnchor[] = [];
  const seen = new Set<number>();
  for (const p of pages) {
    if (p.page <= 9) continue; // skip TOC
    const m = p.text.match(/CHAPTER\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY)\b/);
    if (!m) continue;
    const num = numWord[m[1]];
    if (!num || seen.has(num)) continue;
    seen.add(num);

    // Try to find the running-header title on the next page (the line
    // that's immediately after the chapter-number marker tends to be
    // broken across lines on this page; the next page consolidates it).
    let title = "";
    const nextPage = pages.find((q) => q.page === p.page + 1);
    if (nextPage) {
      // Running header: a line of all-caps short text, sometimes spanning
      // a chapter title we know from the TOC. Take the longest all-caps
      // line on next page as the title.
      const headerCandidates = nextPage.text
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => {
          if (s.length < 8 || s.length > 80) return false;
          const letters = s.replace(/[^A-Za-z]/g, "");
          if (letters.length === 0) return false;
          const upperRatio =
            [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
          return upperRatio >= 0.85;
        });
      if (headerCandidates.length > 0) {
        title = headerCandidates.sort((a, b) => b.length - a.length)[0];
      }
    }
    if (!title) title = `Chapter ${num}`;
    anchors.push({ chapter: num, title, start_page: p.page });
  }
  return anchors;
}

function chapterOfPage(anchors: ChapterAnchor[], page: number): ChapterAnchor | null {
  let current: ChapterAnchor | null = null;
  for (const a of anchors) {
    if (a.start_page <= page) current = a;
    else break;
  }
  return current;
}

/** Split text into paragraph-sized atoms, never breaking a sentence. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/** Walk pages and produce chunks. */
function chunkManuscript(
  pages: ParsedPage[],
  anchors: ChapterAnchor[],
): PendingChunk[] {
  const chunks: PendingChunk[] = [];
  let active: PendingChunk | null = null;
  let activeChapter: number | null = null;

  const startNew = (chapter: ChapterAnchor, page: number, sectionHeading?: string): PendingChunk => ({
    chapter: chapter.chapter,
    chapter_title: chapter.title,
    section_heading: sectionHeading,
    page_start: page,
    page_end: page,
    body: "",
  });

  for (const p of pages) {
    const ch = chapterOfPage(anchors, p.page);
    if (!ch) continue;

    // Chapter boundary — flush the active chunk (if any) before starting fresh.
    if (active && activeChapter !== ch.chapter) {
      if (active.body.trim().length > 0) chunks.push(active);
      active = null;
      activeChapter = ch.chapter;
    }
    if (activeChapter === null) activeChapter = ch.chapter;

    const paras = splitParagraphs(p.text);
    for (const para of paras) {
      // Detect section heading: short ALL-CAPS line in the paragraph atom.
      const isHeading =
        para.length >= 6 &&
        para.length <= 60 &&
        (() => {
          const letters = para.replace(/[^A-Za-z]/g, "");
          if (letters.length === 0) return false;
          const upper =
            [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
          return upper >= 0.9;
        })();

      if (isHeading) {
        // Flush active and seed a new chunk with this section heading.
        if (active && active.body.trim().length > 0) chunks.push(active);
        active = startNew(ch, p.page, para);
        continue;
      }

      if (!active) active = startNew(ch, p.page);
      active.page_end = p.page;

      // Decide whether to extend or roll over.
      const candidateLen = active.body.length + para.length + 2;
      if (candidateLen <= MAX_CHARS) {
        active.body = active.body.length > 0 ? `${active.body}\n\n${para}` : para;
        if (active.body.length >= TARGET_CHARS) {
          chunks.push(active);
          // Seed next chunk with overlap from the tail of the previous body.
          const tail = active.body.slice(-OVERLAP_CHARS);
          active = startNew(ch, p.page, active.section_heading);
          active.body = tail;
        }
      } else {
        // Para alone is huge — emit current, then split paragraph at sentence
        // boundaries to fit.
        if (active.body.trim().length > 0) chunks.push(active);
        const sentences = para.split(/(?<=[.!?])\s+/);
        let buf = "";
        for (const s of sentences) {
          if ((buf + " " + s).length > TARGET_CHARS) {
            if (buf.trim().length > 0) {
              chunks.push({ ...startNew(ch, p.page, undefined), body: buf.trim() });
            }
            buf = s;
          } else {
            buf = buf ? `${buf} ${s}` : s;
          }
        }
        if (buf.trim().length > 0) {
          active = startNew(ch, p.page);
          active.body = buf.trim();
        } else {
          active = null;
        }
      }
    }
  }
  if (active && active.body.trim().length > 0) chunks.push(active);
  return chunks;
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI embedding failed (${resp.status}): ${errBody.slice(0, 200)}`);
  }
  const j = (await resp.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const out: number[][] = [];
  for (const item of j.data ?? []) {
    if (!Array.isArray(item.embedding)) {
      throw new Error("OpenAI returned malformed embedding entry");
    }
    out.push(item.embedding);
  }
  return out;
}

const toVectorLiteral = (vec: number[]): string => `[${vec.join(",")}]`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!SERVICE_ROLE) {
      return json(500, { error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
    }
    if (!OPENAI_API_KEY) {
      return json(500, {
        error: "OPENAI_API_KEY not configured — set in Lovable Cloud Secrets before invoking the indexer",
      });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (body?.confirm !== CONFIRM_PHRASE) {
      return json(400, {
        error: `body must include { "confirm": "${CONFIRM_PHRASE}" }`,
      });
    }

    // Auth gate.
    const adminEmail =
      Deno.env.get("PHASE2_ADMIN_EMAIL") ??
      Deno.env.get("PHASE1_ADMIN_EMAIL") ??
      DEFAULT_FOUNDER_EMAIL;
    const adminToken = Deno.env.get("BACKFILL_ADMIN_TOKEN");
    let gateAuthed = false;
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    if (bearerToken && bearerToken === SERVICE_ROLE) gateAuthed = true;
    if (!gateAuthed && bearerToken) {
      try {
        const parts = bearerToken.split(".");
        if (parts.length === 3) {
          const claims = JSON.parse(
            atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
          ) as { role?: string };
          if (claims.role === "service_role") gateAuthed = true;
        }
      } catch { /* ignore */ }
    }
    let gateUserEmail: string | null = null;
    if (!gateAuthed && authHeader && adminEmail) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      gateUserEmail = u?.user?.email ?? null;
      if (u?.user?.email && u.user.email.toLowerCase() === adminEmail.toLowerCase()) {
        gateAuthed = true;
      }
    }
    if (!gateAuthed && adminToken && body?.adminToken === adminToken) {
      gateAuthed = true;
    }
    console.log("[admin-gate]", JSON.stringify({
      authHeader_present: !!authHeader,
      bearerToken_len: bearerToken?.length ?? 0,
      bearer_is_service_role: bearerToken === SERVICE_ROLE,
      gateUserEmail,
      adminEmail_configured: adminEmail,
      gateAuthed,
    }));
    if (!gateAuthed) {
      return json(403, { error: "admin gate failed" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Pull the manuscript markdown from the private bucket.
    const dl = await admin.storage.from(MANUSCRIPT_BUCKET).download(MANUSCRIPT_OBJECT_KEY);
    if (dl.error || !dl.data) {
      return json(404, {
        error: `manuscript not found at ${MANUSCRIPT_BUCKET}/${MANUSCRIPT_OBJECT_KEY}: ${dl.error?.message ?? "no body"}`,
      });
    }
    const md = await dl.data.text();

    // Parse + chunk.
    const pages = parsePages(md);
    const anchors = detectChapters(pages);
    const chunks = chunkManuscript(pages, anchors);

    if (chunks.length === 0) {
      return json(500, { error: "no chunks produced — markdown may be empty or malformed" });
    }

    // Truncate the table for an idempotent re-run.
    // We deliberately skip a `truncate` RPC (not registered in this project)
    // and use a delete-all instead. supabase-js builders are thenable but
    // not full Promises, so always `await` and destructure rather than
    // chaining `.catch()` on them.
    {
      const { error: delErr } = await admin
        .from("manuscript_chunks")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) {
        return json(500, { error: `failed to clear manuscript_chunks: ${delErr.message}` });
      }
    }

    // Embed in batches of 32 (OpenAI handles batches; smaller is safer).
    const BATCH = 32;
    let inserted = 0;
    let errors = 0;
    const errSamples: string[] = [];
    const seenChapters = new Set<number>();

    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const texts = slice.map((c) => c.body);
      let embeddings: number[][];
      try {
        embeddings = await embedBatch(texts, OPENAI_API_KEY);
      } catch (err) {
        errors += slice.length;
        if (errSamples.length < 5) {
          errSamples.push(err instanceof Error ? err.message : "embed batch failed");
        }
        continue;
      }
      const rows = slice.map((c, j) => ({
        chapter: c.chapter,
        chapter_title: c.chapter_title,
        section_heading: c.section_heading ?? null,
        page_start: c.page_start,
        page_end: c.page_end,
        body: c.body,
        embedding: toVectorLiteral(embeddings[j]),
        token_count: approxTokens(c.body),
      }));
      const { error: insErr } = await admin.from("manuscript_chunks").insert(rows);
      if (insErr) {
        errors += slice.length;
        if (errSamples.length < 5) errSamples.push(`insert: ${insErr.message}`);
        continue;
      }
      inserted += slice.length;
      for (const c of slice) seenChapters.add(c.chapter);
    }

    return json(200, {
      chunks_indexed: inserted,
      errors,
      chapters: Array.from(seenChapters).sort((a, b) => a - b),
      error_samples: errSamples.length > 0 ? errSamples : undefined,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "indexer failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
