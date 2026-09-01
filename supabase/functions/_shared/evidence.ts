// MANUSCRIPT-GROUNDED GENERATION — READ → OUTLINE → WRITE → VERIFY
// ================================================================
// 2026-08-09, at the author's instruction. Prompt-level instruction ("stay
// grounded") plus a post-hoc validator cannot stop plausible fabrication: the
// model holds the book AND its own training knowledge in the same context, and
// the training knowledge is larger and more confident. Live failure that
// triggered this build: "glycerin hydrates high-porosity strands", which the
// author's chapter 14 explicitly contradicts.
//
// The architectural fix is to remove general hair knowledge from the context of
// the call that WRITES the copy:
//
//   STAGE 1  READ AND OUTLINE   full authoritative chapters in  ->  evidence set out.
//                               No advice is written here.
//   STAGE 2  WRITE FROM EVIDENCE ONLY   the evidence set + the member's own
//                               facts, and NOTHING ELSE. The chapters are not
//                               passed. The model physically cannot reach for
//                               industry convention, because its context does
//                               not contain any.
//   STAGE 3  VERIFY             every substantive claim must map to an evidence
//                               item; unmapped claims are rejected (one retry).
//   STAGE 4  STORE              the evidence set is persisted next to the tip,
//                               so every generation is auditable by chapter and
//                               page.
//
// Chapter 1 (The Power of Language) is ALWAYS in the stage 1 input: terminology
// is the primary failure mode.
//
// Chapter/page metadata is recorded in the evidence set for the author's audit
// view, but is NOT passed into stage 2 — the 2026-04-27 citation ban stands and
// the writer must never have a chapter number or page to quote.

import { gatewayFetch } from "./ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "evidence-gather", stage: 1 } as const;

import {
  chaptersForSurface,
  loadChapterRows,
  type SurfaceKey,
} from "./chapter-context.ts";
import { AI_COPY_REVISION } from "./copy-revision.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

const STAGE1_MODEL = "google/gemini-3.6-flash";
const MAPPER_MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface EvidenceItem {
  chapter: number;
  chapter_title: string | null;
  page_start: number | null;
  page_end: number | null;
  /** The author's own words, close to verbatim. */
  passage: string;
  /** One line: why this applies to THIS member. */
  relevance: string;
  /**
   * Provenance. `manuscript` = the author's own text. `clarification` = the
   * author's current stated position, which OVERRIDES the manuscript where the
   * two differ. `external` = established cosmetic science / trichology admitted
   * ONLY in supplement mode, and only under a named manuscript principle (see
   * `governingPrinciple`).
   */
  source?: "manuscript" | "clarification" | "external";

  /** For external items: the manuscript principle that constrains the claim. */
  constrained_by?: string;
}

/**
 * COVERAGE TIER (2026-08-09, author's refinement).
 *
 *   explicit    — the manuscript directly addresses the member's situation.
 *                 Stage 2 gets the evidence set and nothing else.
 *   extension   — the manuscript establishes a principle that applies, but does
 *                 not name this situation. Stage 2 gets the evidence set plus
 *                 the named principle, and may apply it to the situation.
 *   supplement  — the manuscript does not cover it. Stage 2 gets the evidence
 *                 set, the named governing principle, and narrow permission to
 *                 use established cosmetic science / trichology consistent with
 *                 that principle.
 */
export type Coverage = "explicit" | "extension" | "supplement";

export interface EvidenceSet {
  items: EvidenceItem[];
  chapters: number[];
  tokens: number;
  /** False when the manuscript could not be read at all. */
  sourceAvailable: boolean;
  /** Stage 1's classification of how well the book covers this situation. */
  coverage: Coverage;
  /** Stage 1's one-line justification for the classification. */
  coverageReason: string;
  /** The manuscript principle that governs extension / supplement reasoning. */
  governingPrinciple: string;
}

export const EMPTY_EVIDENCE: EvidenceSet = {
  items: [],
  chapters: [],
  tokens: 0,
  sourceAvailable: false,
  coverage: "explicit",
  coverageReason: "",
  governingPrinciple: "",
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

const asCoverage = (v: unknown): Coverage =>
  v === "extension" || v === "supplement" ? v : "explicit";


// ---------------------------------------------------------------------------
// STAGE 1 — read the chapters, output evidence only
// ---------------------------------------------------------------------------

const STAGE1_PROMPT =
  `You are a research assistant working ONLY inside one book. You are given the COMPLETE TEXT of several chapters, and a description of one reader.

Your ONLY job is to EXTRACT EVIDENCE. You must NOT write advice, tips, recommendations, summaries or opinions of any kind. If you write a single instruction to the reader you have failed the task.

Select the passages from the supplied chapters that are relevant to this reader. For each one return:
- "n": the number of the numbered SOURCE PASSAGE it came from.
- "passage": the relevant text, copied from that passage as closely to verbatim as possible. Never paraphrase into your own words. Never merge two passages. Keep it TIGHT: 25-70 words, the sentences that carry the point and nothing around them.
- "relevance": ONE short line stating why it applies to this reader. Reference the reader's own recorded facts. This is not advice. Max 20 words.

Rules:
- Extract ONLY from the supplied passages. Never add anything from your own knowledge of hair care, and never "correct" or "complete" the author. If the author's position contradicts common industry advice, extract the AUTHOR'S position.
- Prioritise passages where the author defines a term, corrects a widespread belief, states a mechanism, or gives a sequence or frequency.
- Always include any passage where the author states what a word means or what she reserves it for.
- COVER THE ACTIONS, NOT JUST THE DEFINITIONS. The writer who receives your evidence must be able to tell this reader what to DO and why. So you must also extract the passages where the author says HOW something is done: the steps, the order they go in, how often, what to use, what to avoid, and what she says happens as a result. An evidence set of definitions alone is a failed extraction.
- Extract at least one passage for each distinct thing this reader might reasonably be told to do, given her recorded style and goal.
- Return between 6 and 10 items — no more. Choose the strongest; a tight set beats a long one. Return an empty array ONLY if genuinely nothing in the supplied text is relevant.
- Be economical. Do not restate, do not explain your choices, do not add commentary outside the JSON fields.

THEN CLASSIFY COVERAGE of this reader's situation by the supplied chapters. Exactly one of:
- "explicit": the author directly addresses this reader's situation — her style, her stated goal or challenge, the thing being asked about. Prefer this classification. The book covers language, styling, scalp health, wash day, moisture retention, ingredients, length retention, treatments and colouring thoroughly, so most situations ARE explicit.
- "extension": the author establishes a principle that plainly applies, but never names this specific situation.
- "supplement": the author does not cover the subject at all and outside knowledge would be required.

Return alongside the evidence:
- "coverage": one of the three words above.
- "coverage_reason": ONE line justifying the classification, naming what the author does or does not address.
- "principle": for "extension" and "supplement", the author's governing principle that must control the reasoning, stated in her terms and drawn from the passages you extracted. Required for those two. Empty string for "explicit".

Never classify "supplement" merely because the author does not use the reader's exact wording, or because you believe there is more to say. Classify "supplement" only when the subject itself is absent from the supplied text.

Reply with JSON only: {"coverage":"...","coverage_reason":"...","principle":"...","evidence":[{"n":<number>,"passage":"...","relevance":"..."}]}`;

interface Stage1Raw {
  n?: number;
  passage?: string;
  relevance?: string;
}

/**
 * Parse stage 1's JSON, salvaging a truncated response instead of throwing it
 * away. A cut-off reply still contains several complete evidence objects, and
 * losing the whole set costs the member a blank, ungrounded answer plus a
 * retry generation. Whole-object regex extraction, so a half-written passage
 * is simply dropped.
 */
function parseStage1(
  content: string,
  fn: string,
): { coverage?: unknown; coverage_reason?: unknown; principle?: unknown; evidence: Stage1Raw[] } | null {
  try {
    const p = JSON.parse(content);
    return { ...p, evidence: Array.isArray(p?.evidence) ? p.evidence : [] };
  } catch {
    const pick = (k: string) => {
      const m = content.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? m[1] : "";
    };
    const evidence: Stage1Raw[] = [];
    for (const m of content.matchAll(/\{[^{}]*\}/g)) {
      try {
        const obj = JSON.parse(m[0]) as Stage1Raw;
        if (typeof obj?.passage === "string" && obj.passage.trim()) evidence.push(obj);
      } catch { /* incomplete object — skip */ }
    }
    console.warn(
      JSON.stringify({ event: "stage1_salvaged", fn, recovered: evidence.length }),
    );
    if (evidence.length === 0) return null;
    return {
      coverage: pick("coverage") || "explicit",
      coverage_reason: pick("coverage_reason"),
      principle: pick("principle"),
      evidence,
    };
  }
}



/**
 * STAGE 1. Reads the authoritative chapters for the surface IN FULL (chapter 1
 * always included) and returns a structured evidence set. Never throws — an
 * empty set means the caller must not generate hair care copy.
 */
export async function gatherEvidence(input: {
  fn: string;
  surface: SurfaceKey;
  /** Humanised member facts + the question being answered. No PII beyond hair data. */
  memberContext: string;
  /**
   * REDUCED CONTEXT (2026-08-09, author's correction). Sponsored product
   * surfaces reason under policy B, where established cosmetic science is
   * already admitted for ingredients the book does not name — so passing three
   * chapters in full to explain a surfactant is mostly wasted spend. Those
   * surfaces pass chapter 1 plus the single most relevant chapter here.
   * Editorial surfaces omit it and keep whole-chapter retrieval unchanged.
   */
  chapters?: number[];
}): Promise<EvidenceSet> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  const chapters = input.chapters?.length
    ? [...new Set(input.chapters)].sort((a, b) => a - b)
    : chaptersForSurface(input.surface);

  // LATENCY (2026-09-01, Part 4). The cache keys off the surface, the member
  // context and the chapter ids — none of which need the chapter BODIES. The
  // whole-chapter read used to run first, so a cache hit still paid for
  // loading the entire manuscript text it was about to throw away. Cache
  // first, and load the chapters only when stage 1 genuinely has to run.
  const ck = cacheKey(input.surface, input.memberContext, chapters);
  const cached = stage1Cache.get(ck);
  if (cached) return cached;
  // Cross-isolate cache. Stage 1 is the single most expensive step in the
  // pipeline (whole chapters in, a full evidence set out), and edge isolates are
  // cold constantly, so the in-memory map above almost never hits in
  // production. Persisting the evidence set removes stage 1 entirely for a
  // member whose recorded facts have not changed.
  const persisted = await readPersistedEvidence(ck);
  if (persisted) {
    stage1Cache.set(ck, persisted);
    return persisted;
  }

  const rows = await loadChapterRows(chapters);
  if (!rows.length || !key) return EMPTY_EVIDENCE;

  // Numbered source passages: stage 1 references them by number, which lets us
  // resolve chapter/page metadata OURSELVES rather than trusting the model with
  // it. The model can therefore never invent a page number (author's rule:
  // never invent or infer metadata).
  const numbered = rows
    .map((r, i) => `[${i + 1}]\n${r.body}`)
    .join("\n\n");


  let raw: Stage1Raw[] = [];
  let tokens = 0;
  let coverage: Coverage = "explicit";
  let coverageReason = "";
  let principle = "";

  try {
    const res = await gatewayFetch(AI_METER_META, GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: STAGE1_MODEL,
        temperature: 0,
        // Latency cap. Output tokens, not input tokens, drive stage 1's wall
        // clock (observed 8,700 out = 33s). A tight set of 6-10 short passages
        // fits comfortably inside this.
        // Latency vs truncation. Reasoning tokens count against this budget on
        // the flash models, so a tight cap was cutting the JSON mid-string:
        // stage 1 then returned EMPTY, grounding failed, and stage 2 had every
        // claim rejected for traceability — a blank "what this means for your
        // hair" AND a second full generation (the retry). Headroom + the
        // salvage parser below removes both.
        max_tokens: 6000,
        response_format: { type: "json_object" },

        messages: [
          { role: "system", content: STAGE1_PROMPT },
          {
            role: "user",
            content:
              `THE READER:\n${input.memberContext}\n\n---\n\nSOURCE PASSAGES (the complete relevant chapters, numbered):\n\n${numbered}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(
        JSON.stringify({ event: "stage1_http_error", fn: input.fn, status: res.status }),
      );
      return EMPTY_EVIDENCE;
    }
    const json = await res.json();
    tokens = Number(json?.usage?.total_tokens ?? 0);
    const content = json?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseStage1(content, input.fn) : null;

    raw = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
    coverage = asCoverage(parsed?.coverage);
    coverageReason = String(parsed?.coverage_reason ?? "").trim().slice(0, 400);
    principle = String(parsed?.principle ?? "").trim().slice(0, 400);
  } catch (e) {
    console.error(JSON.stringify({ event: "stage1_failed", fn: input.fn, error: String(e) }));
    return EMPTY_EVIDENCE;
  }

  // Resolve metadata from OUR row index, and drop any item whose passage is not
  // actually present in that row — that is a fabricated or paraphrased passage
  // and it must never reach stage 2.
  const items: EvidenceItem[] = [];
  for (const r of raw) {
    const idx = Number(r?.n) - 1;
    const row = rows[idx];
    const passage = typeof r?.passage === "string" ? r.passage.trim() : "";
    if (!row || !passage) continue;
    if (!isPresentIn(passage, row.body)) {
      console.warn(
        JSON.stringify({
          event: "stage1_passage_not_verbatim",
          fn: input.fn,
          chapter: row.chapter,
        }),
      );
      continue;
    }
    items.push({
      chapter: row.chapter,
      chapter_title: row.chapter_title ?? null,
      page_start: row.page_start ?? null,
      page_end: row.page_end ?? null,
      passage: passage.slice(0, 1600),
      relevance: String(r?.relevance ?? "").trim().slice(0, 400),
      source: "manuscript",
    });
    if (items.length >= 10) break;
  }

  // A principle is MANDATORY outside explicit mode: extension and supplement
  // reasoning is only permitted when a manuscript principle governs it. Without
  // one we downgrade to explicit, which is the strictest mode — never the
  // permissive one.
  if (coverage !== "explicit" && !principle) {
    console.warn(
      JSON.stringify({
        event: "coverage_downgraded_no_principle",
        fn: input.fn,
        requested: coverage,
      }),
    );
    coverage = "explicit";
  }

  const set: EvidenceSet = {
    items,
    chapters: [...new Set(items.map((i) => i.chapter))].sort((a, b) => a - b),
    tokens,
    sourceAvailable: true,
    coverage,
    coverageReason,
    governingPrinciple: coverage === "explicit" ? "" : principle,
  };
  if (items.length) {
    if (stage1Cache.size > 64) stage1Cache.clear();
    stage1Cache.set(ck, set);
    // Fire and forget — never make generation wait on the cache write.
    writePersistedEvidence(ck, input.surface, set).catch(() => {});
  }
  console.log(
    JSON.stringify({
      event: "stage1_evidence",
      fn: input.fn,
      surface: input.surface,
      chapters: set.chapters,
      items: items.length,
      dropped: raw.length - items.length,
      // Stage 1 input size — the number the context reduction is measured on.
      source_tokens: rows.reduce(
        (a, r) => a + (r.token_count ?? Math.ceil(r.body.length / 4)),
        0,
      ),
      coverage: set.coverage,
      tokens,
    }),
  );

  return set;
}

/** Cheap in-instance cache: the same member signature re-asks the same question. */
const stage1Cache = new Map<string, EvidenceSet>();

// CACHE KEY STABILITY (C1, 2026-08-26).
// -------------------------------------
// The key used to be `norm(ctx).slice(0, 400)`. `memberContext` is assembled by
// each caller from arrays whose row order is NOT pinned (goals, blood flags,
// sensitivities, shelf products), so an unchanged member produced a DIFFERENT
// key on every call — measured 53% brand-new keys across 142 gathers, and zero
// reuse on wash-day-tip. Every miss paid for a whole-chapter stage 1.
//
// The fix is purely mechanical: canonicalise the string before it becomes a key.
// Nothing here changes what any writer receives — `input.memberContext` is
// passed to stage 1 verbatim, exactly as before. This only decides whether two
// calls are recognised as the same call.
//
//   1. Volatile fragments that describe WHEN rather than WHAT are dropped:
//      ISO dates/timestamps, "today"/"yesterday", and days-in-style (the
//      author's rule: days_in_style must never move a score or a cache key).
//   2. Numbers are normalised so 12.30 and 12.3 are the same value.
//   3. The context is split into segments, sorted, and rejoined — so array
//      order upstream can no longer change the key.
//   4. No truncation. The old 400-char slice meant anything after the cut was
//      invisible to the key, which is a collision risk once segments are
//      sorted; the raw key is hashed for persistence anyway.
const VOLATILE_KEY_FRAGMENTS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}(?:t[\d:.]+z?)?\b/g,
  /\b\d{1,4}\s*(?:day|days|week|weeks)\s+in\s+(?:this\s+)?style\b/g,
  /\bday\s*\d{1,4}\s+in\s+style\b/g,
  /\b(?:today|yesterday|tomorrow)\b/g,
  /\bas of\b/g,
];

/**
 * Deterministic, order-free representation of the member context.
 *
 * Two levels, because the volatile ordering is WITHIN a labelled line ("Goals:
 * a, b, c") as well as between lines:
 *   line level  — sentences/lines are sorted.
 *   list level  — a line's label is kept, and only its comma/semicolon-separated
 *                 items are sorted, so "Goals: a, b" and "Goals: b, a" collapse.
 * Decimal points are never used as separators, so 12.30 and 12.3 still normalise
 * to the same value rather than being split apart.
 */
export const canonicalContextKey = (ctx: string): string => {
  let s = norm(ctx);
  for (const re of VOLATILE_KEY_FRAGMENTS) s = s.replace(re, " ");
  // Normalise decimal formatting: 12.30 -> 12.3, 12.0 -> 12
  s = s.replace(/(\d+)\.(\d*?)0+(?![\d])/g, (_m, a, b) => (b ? `${a}.${b}` : a));
  s = s.replace(/(\d+)\.(?![\d])/g, "$1");

  const tidy = (v: string) => v.replace(/\s+/g, " ").trim();
  const canonLine = (line: string) => {
    const at = line.indexOf(":");
    const label = at > -1 ? tidy(line.slice(0, at)) : "";
    const body = at > -1 ? line.slice(at + 1) : line;
    const items = body
      .split(/[;,|•]+/)
      .map(tidy)
      .filter(Boolean)
      .sort()
      .join(",");
    return label ? `${label}:${items}` : items;
  };

  return s
    // Sentence/line boundaries only — a full stop followed by whitespace.
    .split(/[\n\r]+|(?<=\D)\.(?=\s|$)|\.(?=\s+\D)/)
    .map(canonLine)
    .filter(Boolean)
    .sort()
    .join("|");
};


const cacheKey = (surface: string, ctx: string, chapters: number[] = []) =>
  `${surface}::${[...new Set(chapters)].sort((a, b) => a - b).join(",")}::${
    canonicalContextKey(ctx)
  }`;


// ---------------------------------------------------------------------------
// PERSISTED STAGE 1 CACHE
// ---------------------------------------------------------------------------
// Keyed by surface + chapters + the member's recorded facts, and scoped to the
// current copy revision, so bumping AI_COPY_REVISION retires every entry. Only
// the service role can touch the table.

async function evidenceAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  return createClient(url, serviceRole, { auth: { persistSession: false } });
}

/** Stable, short key — the raw signature can be long, so hash it. */
async function hashKey(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readPersistedEvidence(ck: string): Promise<EvidenceSet | null> {
  try {
    const admin = await evidenceAdmin();
    if (!admin) return null;
    const key = await hashKey(`${AI_COPY_REVISION}::${ck}`);
    const { data } = await admin
      .from("manuscript_evidence_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data?.payload) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
    const set = data.payload as EvidenceSet;
    return Array.isArray(set?.items) && set.items.length ? set : null;
  } catch {
    return null;
  }
}

async function writePersistedEvidence(
  ck: string,
  surface: string,
  set: EvidenceSet,
): Promise<void> {
  const admin = await evidenceAdmin();
  if (!admin) return;
  const key = await hashKey(`${AI_COPY_REVISION}::${ck}`);
  await admin.from("manuscript_evidence_cache").upsert(
    {
      cache_key: key,
      surface,
      revision: AI_COPY_REVISION,
      payload: set,
    },
    { onConflict: "cache_key" },
  );
}


/**
 * Is this passage really in the source row? Requires a run of 8 consecutive
 * words to appear verbatim, which paraphrase and invention both fail.
 */
export function isPresentIn(passage: string, source: string): boolean {
  const p = words(passage);
  const s = ` ${norm(source)} `;
  if (p.length < 8) return s.includes(` ${p.join(" ")} `);
  for (let i = 0; i + 8 <= p.length; i++) {
    if (s.includes(` ${p.slice(i, i + 8).join(" ")} `)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// STAGE 2 — the writer's ENTIRE permitted world
// ---------------------------------------------------------------------------

/**
 * The stage 2 payload. This is the ONLY hair care source text stage 2 receives:
 * the extracted passages and why each applies. The full chapters are never
 * passed in any mode, and chapter/page metadata is withheld so nothing can be
 * cited.
 *
 * The three modes differ ONLY in what the writer is permitted to reason with:
 *
 *   explicit    evidence set only.
 *   extension   evidence set + the named principle, which it may apply to the
 *               situation the author does not name. No outside facts.
 *   supplement  evidence set + the named principle + narrow permission to use
 *               established cosmetic science / trichology that is consistent
 *               with that principle. Each such claim must be tagged.
 *
 * In every mode the author's terminology lexicon binds (appended separately by
 * `evidencePromptBlock`) and the manuscript wins any conflict with industry
 * practice.
 */
export function renderEvidenceBlock(set: EvidenceSet): string {
  if (!set.items.length) return "";
  const body = set.items
    .map(
      (it, i) =>
        `EVIDENCE ${i + 1}\n${
          it.source === "clarification"
            ? "HER CURRENT POSITION — BINDING, AND IT OVERRIDES THE BOOK MATERIAL WHERE THEY DIFFER: "
            : "AUTHOR'S TEXT: "
        }${it.passage}${it.relevance ? `\nWHY IT APPLIES TO HER: ${it.relevance}` : ""}`,
    )
    .join("\n\n");


  const conflictRule =
    `THE AUTHOR ALWAYS WINS A CONFLICT. Where established industry practice, marketing language or common terminology contradicts her position, her position governs — without exception and without hedging. Her book exists to correct widespread industry error, so treating industry consensus as authoritative would reproduce the exact error. Example: the industry calls a conditioning shampoo "moisturising"; she does not, and neither do you.`;

  const head = set.coverage === "explicit"
    ? `THE EVIDENCE SET — your ONLY source of hair care fact. Nothing else exists.`
    : `THE EVIDENCE SET — your primary and default source of hair care fact.`;

  const modeRule = set.coverage === "explicit"
    ? `MODE: EXPLICIT. The author covers this situation directly.
1. Every hair care claim, term, mechanism, cause, effect, sequence and frequency you write must come from the EVIDENCE SET above. Nothing else is available to you.
2. You have NO other hair care knowledge. Industry convention, common advice and anything you might otherwise believe are all forbidden and are defects, not fallbacks.
3. If the evidence does not cover something, say LESS. A short answer fully supported by the evidence is correct. One unsupported claim fails the whole answer.`
    : set.coverage === "extension"
    ? `MODE: EXTENSION. The author does not name this exact situation, but she establishes a principle that governs it:

GOVERNING PRINCIPLE (hers): ${set.governingPrinciple}

1. Write from the EVIDENCE SET, applying that principle to her situation. Say plainly what follows from the principle.
2. You may NOT introduce any outside fact, mechanism, ingredient behaviour, product claim or statistic. Extension means applying HER reasoning further, not adding knowledge.
3. If the principle does not reach far enough to answer, say LESS. A shorter answer is correct.`
    : `MODE: SUPPLEMENT. The author does not cover this subject, so established science may be used — but only under her principle:

GOVERNING PRINCIPLE (hers): ${set.governingPrinciple}

1. Start from the EVIDENCE SET. Use it wherever it reaches.
2. Beyond it you may use ESTABLISHED cosmetic science and trichology only, and only where it is consistent with the governing principle above. Anything inconsistent with it is forbidden.
3. FORBIDDEN as sources: marketing claims, brand or product claims, industry or influencer consensus, trends, anything contested, and any mechanism that merely sounds plausible. If you cannot state a claim with confidence from established science, OMIT IT.
4. Where uncertain, say less. A shorter tip beats a speculative one — that is the correct outcome, not a failure.
5. Tag it. For every sentence that rests on outside knowledge rather than the evidence set, list that sentence in an "external" array in your JSON output if your response schema has one; otherwise keep such sentences to a minimum. Untagged outside claims are treated as invented and removed.`;

  return `${head}

${body}

END OF EVIDENCE SET.

${modeRule}

WRITING RULE — ABSOLUTE, ALL MODES:
A. ${conflictRule}
B. Use the author's own words for her own concepts. Never swap her term for a common industry synonym. A term she reserves for one thing may never be applied to another, in any mode.
C. Never invent a claim. Plausible is not the same as established.
D. Never name or refer to a book, author, chapter, section, page or quotation, and never say "the evidence" or "the source". Write directly to her.
E. You may state the member's own recorded facts (her hair type, porosity, style, goal, products, dates) — those come from her profile, not from the evidence.`;
}


// ---------------------------------------------------------------------------
// STAGE 3 — claim-to-evidence mapping
// ---------------------------------------------------------------------------

const MAPPER_PROMPT =
  `You are a claim-mapping auditor. You are given an EVIDENCE SET (numbered passages from one book) and OUTPUT (text written for a reader).

For every substantive hair care claim in OUTPUT, decide which evidence item supports it. A claim is MAPPED only if an evidence item states it or directly implies it. Do NOT map a claim because it sounds correct, is widely believed, or is standard industry advice — those are exactly the failures you exist to catch. Judge against the evidence set only.

JUDGE THE ASSERTION, NOT THE PERSONALISATION. The text is written for one named reader, so it applies the book's material to her recorded hair type, porosity, density, style and goal. That is expected and correct. Strip the reader's own facts out of the sentence and judge only what is left. A claim is MAPPED when the evidence supports the underlying assertion, even though the evidence never mentions her hair type, her style, or her goal. Never report a claim with the reason that the evidence "does not mention" her hair type, porosity, style, goal, or the fact she is the one being addressed — that is not a fidelity failure and reporting it is itself an error.

What IS a failure: an assertion the author does not make at all; a mechanism, cause or effect she does not state; a step, order, frequency or product behaviour that is not in the evidence; or a stronger version of what she says.

IGNORE and never report:
- the reader's own recorded data (hair type, porosity, density, scalp state, current or planned style, goal wording, product or tool names, dates, counts, blood marker values)
- headings and headlines that only name the topic without asserting a mechanism
- tone, encouragement, greetings, and instructions to log something in the app or to see a professional
- mentions of the TT Heat Hat or teamtexture.co.uk
- scheduling or logistics wording that makes no hair care claim

REPORT as unmapped: mechanisms, causes, effects, benefits, harms, ingredient behaviour, technique, sequencing, frequency, and any terminology the evidence does not support.

Reply with JSON only: {"unmapped":[{"claim":"<exact sentence from OUTPUT>","reason":"<which evidence is missing, one sentence>"}]}
An empty array means every claim maps to evidence.`;

/** Extra instructions for extension mode: the principle may be applied. */
const EXTENSION_RULE = (principle: string) =>
  `COVERAGE: EXTENSION. The evidence set does not name this reader's exact situation, but the author establishes a principle that governs it:

GOVERNING PRINCIPLE: ${principle}

A claim is MAPPED when it follows from the evidence set, OR when it is that principle applied to the reader's situation. Do not report a claim solely because the author never names this situation — that is what extension means.
A claim is STILL a failure when it introduces an outside fact, mechanism, ingredient behaviour, statistic or product claim that neither the evidence nor the principle yields.`;

/** Extra instructions for supplement mode: external claims are triaged. */
const SUPPLEMENT_RULE = (principle: string) =>
  `COVERAGE: SUPPLEMENT. The author does not cover this subject, so established science is permitted under her principle:

GOVERNING PRINCIPLE: ${principle}

Triage every claim the evidence set does not support into exactly one bucket:
- "external": it is ESTABLISHED cosmetic science or trichology, is stated with confidence rather than hedged, and is CONSISTENT with the governing principle above. Put it in "external" with the principle it is consistent with.
- "unmapped": anything else — a marketing or brand claim, industry/influencer consensus, a contested position, a trend, a plausible-sounding but unestablished mechanism, an invented number, or anything that CONTRADICTS the governing principle or the author's terminology. These are rejected.

If a claim contradicts the author on any point, it is "unmapped", never "external". The author overrides established industry practice wherever they disagree.

Reply with JSON only: {"unmapped":[{"claim":"...","reason":"..."}],"external":[{"claim":"...","basis":"<the established science, one line>","principle":"<the governing principle it is consistent with>"}]}`;

/**
 * POLICY B — sponsored product surfaces. Established cosmetic science is
 * permitted for ingredient function and product usage, so the mapper triages
 * rather than rejects. The author still wins every conflict, her terminology
 * still binds, and brand marketing is never admissible.
 * See _shared/policy-b.ts for the full policy and its deterministic gates.
 */
const SPONSORED_RULE =
  `POLICY: SPONSORED PRODUCT GUIDANCE. This text describes a specific commercial product to one member. The book cannot cover every commercial formula, so ESTABLISHED cosmetic science is permitted for ingredient function and product usage.

Triage every claim the evidence set does not support into exactly one bucket:
- "external": ESTABLISHED cosmetic science or trichology about ingredient function or product usage, stated with confidence, and NOT in conflict with the author on any point. Give the basis in one line.
- "unmapped": a brand or packaging claim, marketing language ("clinically proven", "seals in hydration", "continuous hydration", timed hydration claims), influencer or community consensus, a contested position, an invented number or mechanism, OR anything that contradicts the author's stated position or her terminology. These are rejected.

Treat these as ACCEPTABLE and never report them: the product's declared ingredient list, an ingredient's POSITION on that list, the absence of an ingredient (e.g. "no protein in the formula"), counts of declared allergens, and the product or brand name. Those are product facts.
Also never report a claim merely for being applied to this member's recorded porosity, cuticle state, density, diameter, texture, elasticity, length, concern, style or goal — personalisation is required on this surface.
Where the author has a position on an ingredient, only HER characterisation of it maps; an industry alternative for the same ingredient is "unmapped".

Reply with JSON only: {"unmapped":[{"claim":"...","reason":"..."}],"external":[{"claim":"...","basis":"<the established science, one line>","principle":"sponsored product guidance"}]}`;


export interface UnmappedClaim {
  claim: string;
  reason: string;
  rule: string;
}

export interface ExternalClaim {
  claim: string;
  basis: string;
  principle: string;
  source: "external";
}

export interface MappingResult {
  unmapped: UnmappedClaim[];
  /** Supplement mode only: claims kept, but labelled as externally sourced. */
  external: ExternalClaim[];
  tokens: number;
  /** False when the mapper could not run (transport failure) — fail open. */
  ran: boolean;
}

/**
 * STAGE 3. Maps each claim in the generated text onto an evidence item. Returns
 * the claims that could not be mapped. On transport failure it returns ran:false
 * so a verifier outage cannot take the whole app down — the deterministic rules
 * and the terminology guard still apply.
 *
 * The mode comes from the evidence set's coverage classification, so a surface
 * cannot ask for a laxer audit than stage 1 justified.
 */
export async function mapClaimsToEvidence(
  output: string,
  set: EvidenceSet,
  opts?: { policy?: "A" | "B" },
): Promise<MappingResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  const empty: MappingResult = { unmapped: [], external: [], tokens: 0, ran: false };
  if (!key || !output.trim() || !set.items.length) return empty;
  const sponsored = opts?.policy === "B";
  const evidence = set.items
    .map((it, i) => `[${i + 1}] ${it.passage}`)
    .join("\n\n");
  const system = sponsored
    ? [MAPPER_PROMPT, SPONSORED_RULE].join("\n\n")
    : [
      MAPPER_PROMPT,
      set.coverage === "extension" ? EXTENSION_RULE(set.governingPrinciple) : "",
      set.coverage === "supplement" ? SUPPLEMENT_RULE(set.governingPrinciple) : "",
    ].filter(Boolean).join("\n\n");

  try {
    const res = await gatewayFetch(AI_METER_META, GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MAPPER_MODEL,
        temperature: 0,
        // The auditor only lists failures; it never needs a long answer.
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `EVIDENCE SET:\n${evidence}\n\n---\n\nOUTPUT:\n${output}` },
        ],
      }),
    });
    if (!res.ok) return empty;
    const json = await res.json();
    const tokens = Number(json?.usage?.total_tokens ?? 0);
    const content = json?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    const unmapped = (Array.isArray(parsed?.unmapped) ? parsed.unmapped : [])
      .filter((v: { claim?: unknown }) => typeof v?.claim === "string" && v.claim.trim())
      .slice(0, 12)
      .map((v: { claim: string; reason?: string }) => ({
        claim: String(v.claim).slice(0, 600),
        reason: String(v.reason ?? "No evidence item supports this claim.").slice(0, 600),
        rule: "unmapped_claim",
      }));
    // External claims are admitted in supplement mode (policy A) and always on
    // sponsored product surfaces (policy B). In any other policy A mode the
    // mapper returning them is itself the defect, so they are rejected.
    const rawExternal = (Array.isArray(parsed?.external) ? parsed.external : [])
      .filter((v: { claim?: unknown }) => typeof v?.claim === "string" && v.claim.trim())
      .slice(0, 12);
    if (!sponsored && set.coverage !== "supplement") {
      for (const v of rawExternal) {
        unmapped.push({
          claim: String(v.claim).slice(0, 600),
          reason: "Outside knowledge is not permitted in this coverage mode.",
          rule: "external_claim_out_of_mode",
        });
      }
      return { unmapped, external: [], tokens, ran: true };
    }

    const external: ExternalClaim[] = rawExternal.map(
      (v: { claim: string; basis?: string; principle?: string }) => ({
        claim: String(v.claim).slice(0, 600),
        basis: String(v.basis ?? "").slice(0, 400),
        principle: String(v.principle ?? set.governingPrinciple).slice(0, 400),
        source: "external" as const,
      }),
    );
    return { unmapped, external, tokens, ran: true };
  } catch {
    return empty;
  }
}


// ---------------------------------------------------------------------------
// Per-request evidence registry
// ---------------------------------------------------------------------------
//
// The verify gate runs inside sanitiseAndLog, often in a different scope from
// the one that built the evidence set. The builder records what it gave the
// writer, keyed by function name; the gate reads it back.

const lastEvidenceByFn = new Map<string, EvidenceSet>();

export function noteEvidence(fn: string, set: EvidenceSet): void {
  if (!set.items.length) return;
  if (lastEvidenceByFn.size > 32) lastEvidenceByFn.clear();
  lastEvidenceByFn.set(fn, set);
}

export function lastEvidence(fn: string): EvidenceSet {
  return lastEvidenceByFn.get(fn) ?? EMPTY_EVIDENCE;
}

// ---------------------------------------------------------------------------
// STAGE 4 — persist the evidence set alongside the tip
// ---------------------------------------------------------------------------

async function admin() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  // @ts-ignore — esm.sh URL import is Deno-native.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface StoreEvidenceInput {
  surface: string;
  functionName: string;
  userId?: string | null;
  memberFacts?: unknown;
  set: EvidenceSet;
  tip: unknown;
  verified: boolean;
  attempts?: number;
  stage2Tokens?: number;
  verifyTokens?: number;
  /** Which grounding policy ran: A = editorial, B = sponsored product. */
  policy?: "A" | "B";
  /** Policy B: every served claim with its source class. */
  claimSources?: Array<{ text: string; source: string; basis?: string }>;
  /** Supplement mode: the claims that came from established science, labelled. */
  externalClaims?: ExternalClaim[];
  /** Which author clarification topics governed this copy. */
  clarifications?: string[];
  /** True when a clarification governed rather than the manuscript. */
  clarificationGoverned?: boolean;
}


/** Persist the evidence set keyed to the generated tip. Returns its id. */
export async function storeEvidenceSet(
  input: StoreEvidenceInput,
): Promise<string | null> {
  try {
    const db = await admin();
    if (!db) return null;
    const external = input.externalClaims ?? [];
    const { data, error } = await db
      .from("tip_evidence_sets")
      .insert({
        surface: input.surface,
        function_name: input.functionName,
        user_id: input.userId ?? null,
        chapters: input.set.chapters,
        member_facts: input.memberFacts ?? {},
        // The stored evidence carries provenance per item: manuscript passages
        // plus, in supplement mode, the externally-sourced claims with the
        // principle that constrained each one.
        evidence: [
          ...input.set.items.map((i) => ({ ...i, source: i.source ?? "manuscript" })),
          ...external.map((e) => ({
            source: "external" as const,
            passage: e.claim,
            relevance: e.basis,
            constrained_by: e.principle,
            chapter: null,
            chapter_title: null,
            page_start: null,
            page_end: null,
          })),
        ],
        coverage: input.set.coverage,
        coverage_reason: input.set.coverageReason || null,
        governing_principle: input.set.governingPrinciple || null,
        external_claims: external,
        tip: input.tip ?? null,
        verified: input.verified,
        attempts: input.attempts ?? 1,
        stage1_tokens: input.set.tokens,
        stage2_tokens: input.stage2Tokens ?? 0,
        verify_tokens: input.verifyTokens ?? 0,
        policy: input.policy ?? "A",
        claim_sources: input.claimSources ?? [],
        clarifications: input.clarifications ?? [],
        clarification_governed: input.clarificationGoverned ?? false,


      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  } catch (e) {
    console.warn("[evidence] failed to store evidence set:", e);
    return null;
  }
}


export interface RejectionRow {
  stage: "stage1" | "stage2" | "stage3_mapping" | "terminology" | "deterministic";
  rule: string;
  detail?: string;
  offendingText?: string;
  attempt?: number;
}

/** The rejection log the author reviews in the admin audit view. */
export async function logGenerationRejections(
  functionName: string,
  rows: RejectionRow[],
  meta: { surface?: string | null; userId?: string | null; evidenceSetId?: string | null } = {},
): Promise<void> {
  if (!rows.length) return;
  try {
    const db = await admin();
    if (!db) return;
    await db.from("tip_generation_rejections").insert(
      rows.map((r) => ({
        evidence_set_id: meta.evidenceSetId ?? null,
        surface: meta.surface ?? null,
        function_name: functionName,
        user_id: meta.userId ?? null,
        stage: r.stage,
        rule: r.rule,
        detail: (r.detail ?? "").slice(0, 1000) || null,
        offending_text: (r.offendingText ?? "").slice(0, 1000) || null,
        attempt: r.attempt ?? 1,
      })),
    );
  } catch (e) {
    console.warn("[evidence] failed to log rejections:", e);
  }
}

// ---------------------------------------------------------------------------
// Shared entry point for surfaces that build their own prompt
// ---------------------------------------------------------------------------

import { FIDELITY_RULE, noteSourceText } from "./chapter-context.ts";
import { loadLexicon, terminologyBlock } from "./terminology.ts";
import {
  clarificationsBlock,
  forSurface,
  loadClarifications,
  type Clarification,
} from "./clarifications.ts";

/**
 * AUTHOR CLARIFICATIONS — merged into the evidence set as first-class evidence,
 * senior to the manuscript. This is what makes them binding rather than
 * advisory: the writer sees them in its only permitted world, and stage 3 can
 * map a claim onto them instead of rejecting it as unsupported.
 *
 * Returns a NEW set (the stage 1 cache must never be mutated).
 */
export function withClarifications(
  set: EvidenceSet,
  rows: Clarification[],
): { set: EvidenceSet; used: Clarification[] } {
  if (!rows.length) return { set, used: [] };
  const items: EvidenceItem[] = rows.map((r) => ({
    chapter: 0,
    chapter_title: `Author clarification — ${r.topic}`,
    page_start: null,
    page_end: null,
    passage: r.position,
    relevance: "Her current position on this topic. It governs over the book material.",
    source: "clarification" as const,
  }));
  return { set: { ...set, items: [...items, ...set.items] }, used: rows };
}

/** Load the clarifications that apply to a surface. */
export async function surfaceClarifications(surface?: string | null): Promise<Clarification[]> {
  return forSurface(await loadClarifications(), surface ?? null);
}

/**
 * Stage 1, ready to drop into a system prompt. Returns the WRITER's entire
 * permitted hair care world: the author's binding clarifications, the evidence
 * set, her terminology, and the deterministic author-verified bans. The full
 * chapters are NOT included.
 *
 * `block` is empty when no evidence could be extracted — the caller must then
 * not generate hair care copy (fallback: the brief "being prepared" state).
 */
export async function evidencePromptBlock(input: {
  fn: string;
  surface: SurfaceKey;
  memberContext: string;
  /** See `gatherEvidence` — reduced chapter set for sponsored surfaces. */
  chapters?: number[];
}): Promise<{ block: string; evidence: EvidenceSet; grounded: boolean }> {
  // LATENCY (2026-09-01, Part 4). The clarifications and the terminology
  // lexicon are independent reads that used to sit BEHIND stage 1 and behind
  // each other, adding their full round trips to every generation. They now
  // run alongside the stage 1 gather. Identical inputs to the writer — only
  // what we wait for changed.
  const [base, clarifications, lexicon] = await Promise.all([
    gatherEvidence(input),
    surfaceClarifications(input.surface),
    loadLexicon(),
  ]);
  if (!base.items.length) {
    return { block: "", evidence: base, grounded: false };
  }
  const { set } = withClarifications(base, clarifications);
  const parts: string[] = [];
  const clar = clarificationsBlock(clarifications);
  if (clar) parts.push(clar);
  parts.push(renderEvidenceBlock(set));
  const lex = terminologyBlock(lexicon);
  if (lex) parts.push(lex);
  parts.push(FIDELITY_RULE);
  noteSourceText(input.fn, set.items.map((i) => i.passage).join("\n\n"), set.chapters);
  noteEvidence(input.fn, set);
  return { block: parts.join("\n\n"), evidence: set, grounded: true };

}

