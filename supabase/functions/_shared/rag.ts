// RAG helper. Audit PHASE_2_AUDIT.md §3.5.
//
// Embeds a query string with OpenAI text-embedding-3-small (1536 dims),
// queries `manuscript_chunks` via the service-role client using cosine
// similarity, returns the top-K passages with metadata. The metadata is
// kept for internal logging only — the rendered prompt block contains
// just the passage body (no book/chapter citation), per the 2026-04-27
// citation-ban rule.
//
// IMPORTANT: throws a clear error if OPENAI_API_KEY is missing rather
// than falling back silently. The wash-day-fallback bug pattern from
// the Phase 1 audit (a fake fallback masking AI outages) is exactly
// what we don't want here either.

// Note: the supabase client is loaded via *dynamic* import inside
// retrievePassages so the module can be loaded in test environments
// (Vitest under jsdom) without the network-import resolver tripping on
// the esm.sh URL. Production Deno resolves the dynamic import the same
// way as a static one.

// --- Type shim so the frontend tsc (which scans this file even though
// it's a Deno edge function) doesn't error on the Deno global. At
// runtime under Deno this is real; under tsc it's just a declaration.
declare const Deno: { env: { get(key: string): string | undefined } };

export interface Passage {
  body: string;
  chapter: number;
  chapter_title: string;
  section_heading?: string;
  page_start?: number;
  page_end?: number;
  similarity: number;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

// Embedding a query is a full OpenAI round-trip (~300-800ms) on the critical
// path of every AI call. The same query strings recur constantly (same product,
// same marker, same wash step), so memoise per warm isolate.
const embedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 200;

/** Embed a single string with OpenAI text-embedding-3-small. */
export async function embedQuery(query: string): Promise<number[]> {
  const cached = embedCache.get(query);
  if (cached) return cached;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not configured — RAG retrieval cannot run. Set the secret in Lovable Cloud Secrets.",
    );
  }
  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: query }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI embedding failed (${resp.status}): ${errBody.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
    throw new Error(
      `OpenAI returned unexpected embedding shape (length=${vec?.length ?? 0})`,
    );
  }
  if (embedCache.size >= EMBED_CACHE_MAX) embedCache.clear();
  embedCache.set(query, vec);
  return vec;
}

interface ChunkRow {
  body: string;
  chapter: number;
  chapter_title: string;
  section_heading: string | null;
  page_start: number | null;
  page_end: number | null;
  similarity: number;
}

/** Retrieve top-K passages from the manuscript that are most similar to
 *  the query. Uses a service-role Supabase client (bypasses RLS) since
 *  manuscript_chunks deliberately has no SELECT policy for clients.
 *
 *  Ranking happens IN THE DATABASE via the pgvector `<=>` cosine-distance
 *  operator inside public.match_manuscript_chunks(), so the whole
 *  manuscript is searched — not an arbitrary capped sample. The optional
 *  chapterFilter narrows retrieval to specific chapters.
 */
export async function retrievePassages(
  query: string,
  k: number = 4,
  chapterFilter?: number[],
): Promise<Passage[]> {
  if (!query || query.trim().length === 0) return [];
  const trimmedK = Math.max(1, Math.min(k, 10));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "supabase service-role env missing — RAG cannot reach manuscript_chunks",
    );
  }

  const queryVec = await embedQuery(query);

  // Dynamic import — see file-header note. Production Deno resolves this
  // the same as a static import; tests that throw before reaching this
  // line (e.g. on missing OPENAI_API_KEY) never need the supabase client.
  // @ts-ignore — esm.sh URL import is Deno-native; frontend tsc can't resolve it.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("match_manuscript_chunks", {
    query_embedding: `[${queryVec.join(",")}]`,
    match_count: trimmedK,
    chapter_filter:
      chapterFilter && chapterFilter.length > 0 ? chapterFilter : null,
  });

  if (error) {
    throw new Error(`match_manuscript_chunks rpc failed: ${error.message}`);
  }

  const rows = (data ?? []) as ChunkRow[];
  return rows.map((row) => ({
    body: row.body,
    chapter: row.chapter,
    chapter_title: row.chapter_title,
    section_heading: row.section_heading ?? undefined,
    page_start: row.page_start ?? undefined,
    page_end: row.page_end ?? undefined,
    similarity: typeof row.similarity === "number" ? row.similarity : 0,
  }));
}

/**
 * Render a passage as a system-prompt block.
 *
 * NB: we deliberately do NOT include a "Read more — …" book/chapter citation
 * here any more (Paige, 2026-04-27). The model is forbidden from naming the
 * source manuscript in user-facing output, so we keep the body + heading only.
 * The chapter/page metadata stays internal — it's still in `Passage` for
 * logging and debugging, just never injected into the prompt.
 */
export function renderPassageBlock(p: Passage): string {
  const heading = p.section_heading ? `### ${p.section_heading}\n` : "";
  return `${heading}${p.body}`;
}
