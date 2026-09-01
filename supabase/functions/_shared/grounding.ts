// Shared manuscript-grounding helper for the NON-Claude (Lovable/Gemini)
// paths and for the single-path functions. Imported by many edge functions.
// paths and for the single-path functions.
//
// Every consumer-facing AI surface must be genuinely grounded in the
// manuscript on every generation:
//   1. select the relevant curated knowledge topics,
//   2. retrieve manuscript passages from manuscript_chunks (DB-side vector
//      search — see rag.ts / match_manuscript_chunks),
//   3. inject both into the system prompt with a hard grounding instruction.
//
// Retrieval is retried once. If it still fails we DO NOT block the user —
// we generate anyway, but the caller stamps `_manuscript_grounded: false`
// on the payload and a structured log line is written so ungrounded
// outputs are visible in the function logs. No PII is ever logged.

import {
  renderTopicBlock,
  selectTopicsForContext,
  type SelectorContext,
} from "./knowledge/index.ts";
import type { FunctionKind, TopicId } from "./knowledge/types.ts";
import { renderPassageBlock, retrievePassages } from "./rag.ts";
import {
  FIDELITY_RULE,
  noteSourceText,
  type SurfaceKey,
} from "./chapter-context.ts";
import {
  gatherEvidence,
  noteEvidence,
  renderEvidenceBlock,
  surfaceClarifications,
  withClarifications,
  type EvidenceSet,
} from "./evidence.ts";
import { clarificationsBlock, clarificationSourceText } from "./clarifications.ts";
import { loadLexicon, terminologyBlock } from "./terminology.ts";

import {
  METHOD_AND_TIMING_RULE,
  retrieveProceduralPassages,
} from "./procedural-rag.ts";

import { allChallenges, challengeText, challengesOf } from "./challenges.ts";

/** The single wording used everywhere a passages block is injected. */
export const GROUNDING_INSTRUCTION =
  `GROUNDING RULE — NON-NEGOTIABLE:
Every recommendation you make must be curated from the EVIDENCE SET (or RETRIEVED MANUSCRIPT PASSAGES) and the STRAND KNOWLEDGE TOPICS below. If a point is not directly covered, reason from the closest teaching in them — never from general training data or generic hair-care lore. Never contradict them. Never name the book, its chapters, or page numbers in your output.`;

export interface GroundingResult {
  /** Ready-to-append system-prompt text (empty string when nothing to add). */
  block: string;
  /** True when at least one manuscript passage was retrieved. */
  grounded: boolean;
  /** Number of retrieved passages. */
  passages: number;
  /** Number of knowledge topics injected. */
  topics: number;
  /** The raw manuscript text supplied to the model — the verifier's source. */
  sourceText: string;
  /** Chapters the evidence came from (empty on the legacy fragment path). */
  chapters: number[];
  /** The stage 1 evidence set — present on the two-stage grounded path. */
  evidence?: EvidenceSet;
}

export interface GroundingInput {
  /** Function name, used for structured logging only. */
  fn: string;
  /** Function kind used by the topic selector's strict gate. */
  functionKind: FunctionKind;
  selectorContext?: SelectorContext;
  forceTopics?: TopicId[];
  ragQuery: string;
  ragK?: number;
  /**
   * FIDELITY PATH (preferred). Name the surface and its authoritative chapters
   * are passed IN FULL — chapter 1 always included — and fragment retrieval is
   * skipped. See _shared/chapter-context.ts.
   */
  surface?: SurfaceKey;
  /** Optional chapter scoping for the legacy fragment path. */
  chapterFilter?: number[];

  /**
   * TIP SURFACES: bias retrieval toward PROCEDURAL passages (steps, timings,
   * frequencies, treatments) instead of thematic ones, and append the method
   * rule to the prompt. Without this the model only has themes and produces
   * tautologies. See _shared/procedural-rag.ts.
   */
  proceduralBias?: boolean;
}

/** Retrieve with one retry, plus the unscoped fallback when a chapter
 *  filter yields nothing. Throws only if both attempts fail. */
async function retrieveWithRetry(
  query: string,
  k: number,
  chapterFilter?: number[],
  proceduralBias?: boolean,
): Promise<Awaited<ReturnType<typeof retrievePassages>>> {
  const attempt = async () => {
    if (proceduralBias) {
      const res = await retrieveProceduralPassages(query, k, chapterFilter);
      return res.passages;
    }
    let passages = await retrievePassages(query, k, chapterFilter);
    if (passages.length === 0 && chapterFilter && chapterFilter.length > 0) {
      passages = await retrievePassages(query, k);
    }
    return passages;
  };
  try {
    return await attempt();
  } catch (_first) {
    return await attempt();
  }
}

/**
 * Build the knowledge-topics + retrieved-passages system block.
 * Never throws — retrieval failures degrade to `grounded: false`.
 */
export async function buildGroundingBlock(
  input: GroundingInput,
): Promise<GroundingResult> {
  const topics = selectTopicsForContext(input.selectorContext ?? {}, {
    function_kind: input.functionKind,
    force: input.forceTopics,
  });
  const topicBlocks = topics.map(renderTopicBlock);

  // ── TWO-STAGE GROUNDED PATH (2026-08-09) ────────────────────────────────
  // When the caller names its surface, this function IS stage 1: it reads the
  // authoritative chapters in full (chapter 1 always included) and extracts an
  // evidence set. The block returned to the caller — i.e. the context of the
  // call that WRITES the copy, stage 2 — contains the evidence set and the
  // member's own facts ONLY. The chapters are never passed to the writer, so
  // general hair knowledge is not available to it. See _shared/evidence.ts.
  // LATENCY (2026-09-01, Part 4). The clarifications read and the terminology
  // lexicon are independent of the evidence gather, so they are started here
  // and awaited after it instead of queueing behind it.
  const clarificationsPromise = surfaceClarifications(input.surface ?? null);
  const lexiconPromise = loadLexicon();
  let evidence: EvidenceSet | null = null;
  if (input.surface) {
    const set = await gatherEvidence({
      fn: input.fn,
      surface: input.surface,
      memberContext: input.ragQuery,
    });
    if (set.items.length > 0) evidence = set;
  }


  let passageBlocks: string[] = [];
  let grounded = Boolean(evidence);
  // Fragment retrieval remains ONLY for the legacy surfaces that do not name a
  // surface key. A named surface never silently degrades to fragments.
  if (!evidence && !input.surface) {
    try {
      const passages = await retrieveWithRetry(
        input.ragQuery,
        input.ragK ?? 4,
        input.chapterFilter,
        input.proceduralBias,
      );
      passageBlocks = passages.map(renderPassageBlock);
      grounded = passageBlocks.length > 0;
    } catch {
      grounded = false;
    }
  }

  if (!grounded) {
    // Structured, PII-free log line so ungrounded generations are visible.
    console.error(
      JSON.stringify({
        event: "manuscript_grounding_failed",
        fn: input.fn,
        surface: input.surface ?? null,
        rag_k: input.ragK ?? 4,
        chapter_scoped: Boolean(input.chapterFilter?.length),
        topics: topicBlocks.length,
      }),
    );
  }

  // AUTHOR CLARIFICATIONS — her current positions, binding and senior to the
  // manuscript. They go into EVERY hair care generation: merged into the
  // evidence set on the grounded path, and injected as their own block on the
  // legacy fragment path.
  const clarifications = await surfaceClarifications(input.surface ?? null);
  if (evidence && clarifications.length > 0) {
    evidence = withClarifications(evidence, clarifications).set;
  }

  const parts: string[] = [];
  const clarBlock = clarificationsBlock(clarifications);
  if (clarBlock) parts.push(clarBlock);
  if (topicBlocks.length > 0) {
    parts.push(
      `STRAND KNOWLEDGE TOPICS (curated manuscript teachings for THIS user):\n\n${
        topicBlocks.join("\n\n---\n\n")
      }`,
    );
  }
  if (evidence) {
    parts.push(renderEvidenceBlock(evidence));
    const lex = terminologyBlock(await loadLexicon());
    if (lex) parts.push(lex);
    parts.push(FIDELITY_RULE);
  }
  if (passageBlocks.length > 0) {
    parts.push(
      `RETRIEVED MANUSCRIPT PASSAGES (verbatim teachings retrieved for this user's data — draw every recommendation from here):\n\n${
        passageBlocks.join("\n\n---\n\n")
      }`,
    );
  }
  if (parts.length > 0) parts.push(GROUNDING_INSTRUCTION);
  if (input.proceduralBias) parts.push(METHOD_AND_TIMING_RULE);


  const sourceText = [
    evidence
      ? evidence.items.map((i) => i.passage).join("\n\n")
      : passageBlocks.join("\n\n"),
    clarificationSourceText(clarifications),
  ]
    .filter(Boolean)
    .join("\n\n");

  const chaptersUsed = evidence?.chapters ?? input.chapterFilter ?? [];
  // Record what the writer was given so the verify gate in sanitiseAndLog can
  // map every claim back to this exact evidence.
  noteSourceText(input.fn, sourceText, chaptersUsed);
  if (evidence) noteEvidence(input.fn, evidence);

  return {
    block: parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "",
    grounded,
    passages: evidence ? evidence.items.length : passageBlocks.length,
    topics: topicBlocks.length,
    sourceText,
    chapters: chaptersUsed,
    evidence: evidence ?? undefined,
  };
}


/** Stamp the grounding provenance onto a payload object. */
export function stampGrounding<T extends Record<string, unknown>>(
  payload: T,
  g: { grounded: boolean; passages: number },
): T & { _manuscript_grounded: boolean; _rag_passages: number } {
  return {
    ...payload,
    _manuscript_grounded: g.grounded,
    _rag_passages: g.passages,
  };
}

/** Common helper: derive a flagged-blood-marker phrase from a context blob. */
export function flaggedMarkerPhrase(
  bloodResults: unknown,
): string {
  if (!Array.isArray(bloodResults)) return "";
  return (bloodResults as Array<{ marker?: string; status?: string | null }>)
    .filter(
      (b) =>
        b?.status &&
        !["normal", "untested"].includes(String(b.status).toLowerCase()),
    )
    .map((b) => `${b.status} ${b.marker}`)
    .join(" ");
}

/** Derive a SelectorContext from the standard buildAiContext() payload
 *  the frontend sends as `context`. Tolerant of missing slices. */
export function selectorFromAiContext(
  ctx: Record<string, unknown> | null | undefined,
): SelectorContext {
  const c = (ctx ?? {}) as Record<string, unknown>;
  const hp = (c.hairProfile ?? c.hair ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp ?? hp.scalp_condition),
      diagnosed: arr(hp.diagnosed ?? hp.diagnosed_conditions),
    },
    health: (c.healthProfile ?? c.health ?? null) as unknown as SelectorContext["health"],
    bloodResults: Array.isArray(c.bloodResults)
      ? (c.bloodResults as Array<{ marker?: string; status?: string | null }>)
      : [],
  };
}

/** Build a RAG query string from the standard aiContext payload. */
export function ragQueryFromAiContext(
  ctx: Record<string, unknown> | null | undefined,
  prefix: string,
): string {
  const c = (ctx ?? {}) as Record<string, unknown>;
  const hp = (c.hairProfile ?? c.hair ?? {}) as Record<string, unknown>;
  const style = (c.currentStyle ?? {}) as Record<string, unknown>;
  const goals = Array.isArray(c.goals)
    ? (c.goals as Array<Record<string, unknown>>)
    : [];
  const one = (v: unknown) => (v == null ? "" : String(v));
  return [
    prefix,
    one(hp.porosity) && `${one(hp.porosity)} porosity`,
    one(hp.density) && `${one(hp.density)} density`,
    one(hp.scalp ?? hp.scalp_condition),
    one(hp.hair_type),
    style.current_hairstyle ? `wearing ${one(style.current_hairstyle)}` : "",
    goals.map((g) => `${one(g.title)} ${challengesOf(g).join(" ")}`).join(" ").trim(),
    flaggedMarkerPhrase(c.bloodResults),
  ].filter(Boolean).join(" — ");
}
