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

import {
  chaptersForSurface,
  loadChapterRows,
  type SurfaceKey,
} from "./chapter-context.ts";

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
   * Provenance. `manuscript` = the author's own text. `external` = established
   * cosmetic science / trichology admitted ONLY in supplement mode, and only
   * under a named manuscript principle (see `governingPrinciple`).
   */
  source?: "manuscript" | "external";
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
- "passage": the relevant text, copied from that passage as closely to verbatim as possible. Never paraphrase into your own words. Never merge two passages. 40-120 words.
- "relevance": ONE line stating why it applies to this reader. Reference the reader's own recorded facts. This is not advice.

Rules:
- Extract ONLY from the supplied passages. Never add anything from your own knowledge of hair care, and never "correct" or "complete" the author. If the author's position contradicts common industry advice, extract the AUTHOR'S position.
- Prioritise passages where the author defines a term, corrects a widespread belief, states a mechanism, or gives a sequence or frequency.
- Always include any passage where the author states what a word means or what she reserves it for.
- COVER THE ACTIONS, NOT JUST THE DEFINITIONS. The writer who receives your evidence must be able to tell this reader what to DO and why. So you must also extract the passages where the author says HOW something is done: the steps, the order they go in, how often, what to use, what to avoid, and what she says happens as a result. An evidence set of definitions alone is a failed extraction.
- Extract at least one passage for each distinct thing this reader might reasonably be told to do, given her recorded style and goal.
- Return between 8 and 16 items. Return an empty array ONLY if genuinely nothing in the supplied text is relevant.

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
 * STAGE 1. Reads the authoritative chapters for the surface IN FULL (chapter 1
 * always included) and returns a structured evidence set. Never throws — an
 * empty set means the caller must not generate hair care copy.
 */
export async function gatherEvidence(input: {
  fn: string;
  surface: SurfaceKey;
  /** Humanised member facts + the question being answered. No PII beyond hair data. */
  memberContext: string;
}): Promise<EvidenceSet> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  const chapters = chaptersForSurface(input.surface);
  const rows = await loadChapterRows(chapters);
  if (!rows.length || !key) return EMPTY_EVIDENCE;

  // Numbered source passages: stage 1 references them by number, which lets us
  // resolve chapter/page metadata OURSELVES rather than trusting the model with
  // it. The model can therefore never invent a page number (author's rule:
  // never invent or infer metadata).
  const numbered = rows
    .map((r, i) => `[${i + 1}]\n${r.body}`)
    .join("\n\n");

  const cached = stage1Cache.get(cacheKey(input.surface, input.memberContext));
  if (cached) return cached;

  let raw: Stage1Raw[] = [];
  let tokens = 0;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: STAGE1_MODEL,
        temperature: 0,
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
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    raw = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
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
    });
    if (items.length >= 10) break;
  }

  const set: EvidenceSet = {
    items,
    chapters: [...new Set(items.map((i) => i.chapter))].sort((a, b) => a - b),
    tokens,
    sourceAvailable: true,
  };
  if (items.length) {
    if (stage1Cache.size > 64) stage1Cache.clear();
    stage1Cache.set(cacheKey(input.surface, input.memberContext), set);
  }
  console.log(
    JSON.stringify({
      event: "stage1_evidence",
      fn: input.fn,
      surface: input.surface,
      chapters: set.chapters,
      items: items.length,
      dropped: raw.length - items.length,
      tokens,
    }),
  );
  return set;
}

/** Cheap in-instance cache: the same member signature re-asks the same question. */
const stage1Cache = new Map<string, EvidenceSet>();
const cacheKey = (surface: string, ctx: string) => `${surface}::${norm(ctx).slice(0, 400)}`;

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
 * the extracted passages and why each applies. The full chapters are not passed,
 * and chapter/page metadata is withheld so nothing can be cited.
 */
export function renderEvidenceBlock(set: EvidenceSet): string {
  if (!set.items.length) return "";
  const body = set.items
    .map(
      (it, i) =>
        `EVIDENCE ${i + 1}\nAUTHOR'S TEXT: ${it.passage}${
          it.relevance ? `\nWHY IT APPLIES TO HER: ${it.relevance}` : ""
        }`,
    )
    .join("\n\n");
  return `THE EVIDENCE SET — your ONLY source of hair care fact. Nothing else exists.

${body}

END OF EVIDENCE SET.

WRITING RULE — ABSOLUTE:
1. Every hair care claim, term, mechanism, cause, effect, sequence and frequency you write must come from the EVIDENCE SET above. Nothing else is available to you.
2. You have NO other hair care knowledge. Industry convention, common advice and anything you might otherwise believe are all forbidden and are defects, not fallbacks.
3. If the evidence does not cover something, say LESS. A short answer fully supported by the evidence is correct. One unsupported claim fails the whole answer.
4. Use the author's own words for her own concepts. Never swap her term for a common industry synonym.
5. Never name or refer to a book, author, chapter, section, page or quotation, and never say "the evidence" or "the source". Write directly to her.
6. You may state the member's own recorded facts (her hair type, porosity, style, goal, products, dates) — those come from her profile, not from the evidence.`;
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

export interface UnmappedClaim {
  claim: string;
  reason: string;
  rule: string;
}

export interface MappingResult {
  unmapped: UnmappedClaim[];
  tokens: number;
  /** False when the mapper could not run (transport failure) — fail open. */
  ran: boolean;
}

/**
 * STAGE 3. Maps each claim in the generated text onto an evidence item. Returns
 * the claims that could not be mapped. On transport failure it returns ran:false
 * so a verifier outage cannot take the whole app down — the deterministic rules
 * and the terminology guard still apply.
 */
export async function mapClaimsToEvidence(
  output: string,
  set: EvidenceSet,
): Promise<MappingResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !output.trim() || !set.items.length) {
    return { unmapped: [], tokens: 0, ran: false };
  }
  const evidence = set.items
    .map((it, i) => `[${i + 1}] ${it.passage}`)
    .join("\n\n");
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MAPPER_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MAPPER_PROMPT },
          { role: "user", content: `EVIDENCE SET:\n${evidence}\n\n---\n\nOUTPUT:\n${output}` },
        ],
      }),
    });
    if (!res.ok) return { unmapped: [], tokens: 0, ran: false };
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
    return { unmapped, tokens, ran: true };
  } catch {
    return { unmapped: [], tokens: 0, ran: false };
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
}

/** Persist the evidence set keyed to the generated tip. Returns its id. */
export async function storeEvidenceSet(
  input: StoreEvidenceInput,
): Promise<string | null> {
  try {
    const db = await admin();
    if (!db) return null;
    const { data, error } = await db
      .from("tip_evidence_sets")
      .insert({
        surface: input.surface,
        function_name: input.functionName,
        user_id: input.userId ?? null,
        chapters: input.set.chapters,
        member_facts: input.memberFacts ?? {},
        evidence: input.set.items,
        tip: input.tip ?? null,
        verified: input.verified,
        attempts: input.attempts ?? 1,
        stage1_tokens: input.set.tokens,
        stage2_tokens: input.stage2Tokens ?? 0,
        verify_tokens: input.verifyTokens ?? 0,
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

/**
 * Stage 1, ready to drop into a system prompt. Returns the WRITER's entire
 * permitted hair care world: the evidence set, the author's terminology, and the
 * deterministic author-verified bans. The full chapters are NOT included.
 *
 * `block` is empty when no evidence could be extracted — the caller must then
 * not generate hair care copy (fallback: the brief "being prepared" state).
 */
export async function evidencePromptBlock(input: {
  fn: string;
  surface: SurfaceKey;
  memberContext: string;
}): Promise<{ block: string; evidence: EvidenceSet; grounded: boolean }> {
  const set = await gatherEvidence(input);
  if (!set.items.length) {
    return { block: "", evidence: set, grounded: false };
  }
  const parts = [renderEvidenceBlock(set)];
  const lex = terminologyBlock(await loadLexicon());
  if (lex) parts.push(lex);
  parts.push(FIDELITY_RULE);
  noteSourceText(input.fn, set.items.map((i) => i.passage).join("\n\n"), set.chapters);
  noteEvidence(input.fn, set);
  return { block: parts.join("\n\n"), evidence: set, grounded: true };
}
