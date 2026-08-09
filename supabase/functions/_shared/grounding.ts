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
  loadSurfaceChapters,
  renderChapterBlock,
  type ChapterContext,
  type SurfaceKey,
} from "./chapter-context.ts";
import {
  METHOD_AND_TIMING_RULE,
  retrieveProceduralPassages,
} from "./procedural-rag.ts";

import { allChallenges, challengeText, challengesOf } from "./challenges.ts";

/** The single wording used everywhere a passages block is injected. */
export const GROUNDING_INSTRUCTION =
  `GROUNDING RULE — NON-NEGOTIABLE:
Every recommendation you make must be curated from the RETRIEVED MANUSCRIPT PASSAGES and the STRAND KNOWLEDGE TOPICS below. If a point is not directly covered, reason from the closest teaching in them — never from general training data or generic hair-care lore. Never contradict them. Never name the book, its chapters, or page numbers in your output.`;

export interface GroundingResult {
  /** Ready-to-append system-prompt text (empty string when nothing to add). */
  block: string;
  /** True when at least one manuscript passage was retrieved. */
  grounded: boolean;
  /** Number of retrieved passages. */
  passages: number;
  /** Number of knowledge topics injected. */
  topics: number;
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
  /** Optional chapter scoping. When it returns nothing we retry unscoped. */
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

  // WHOLE-CHAPTER PATH (2026-08-09 fidelity fix). When the caller names its
  // surface we pass the authoritative chapters IN FULL — chapter 1 always
  // included — instead of top-k fragments. Fragment retrieval was the root
  // cause of the model filling context gaps from general knowledge.
  let chapterCtx: ChapterContext | null = null;
  if (input.surface) {
    chapterCtx = await loadSurfaceChapters(input.surface);
    if (!chapterCtx.text) chapterCtx = null;
  }

  let passageBlocks: string[] = [];
  let grounded = Boolean(chapterCtx);
  if (!chapterCtx) {
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

  const parts: string[] = [];
  if (topicBlocks.length > 0) {
    parts.push(
      `STRAND KNOWLEDGE TOPICS (curated manuscript teachings for THIS user):\n\n${
        topicBlocks.join("\n\n---\n\n")
      }`,
    );
  }
  if (chapterCtx) {
    parts.push(renderChapterBlock(chapterCtx));
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


  return {
    block: parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "",
    grounded,
    passages: chapterCtx ? chapterCtx.chunks : passageBlocks.length,
    topics: topicBlocks.length,
    sourceText: chapterCtx?.text ?? passageBlocks.join("\n\n"),
    chapters: chapterCtx?.chapters ?? input.chapterFilter ?? [],
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
