// Composer that assembles a Claude request from per-call ingredients:
// persona (cached), KB topics (cached), RAG passages (per-query), task
// instructions (per-call), user payload, optional tool schema.
// Audit PHASE_2_AUDIT.md §4.3.
//
// In Step 0 the KB and RAG slots are placeholders — Step 1 (KB + indexer)
// populates them. The composer is forward-compatible: callers in Step 0
// pass `[]` for both and the resulting system array just contains the
// persona + task instructions.
//
// System block layout (in this exact order):
//   [0] STRAND_PERSONA            cache_control: ephemeral
//                                  (warms at first call; reused across all
//                                   functions in the same 5-min window)
//   [1] knowledge topics joined   cache_control: ephemeral
//                                  (warms when the same topic set recurs)
//   [2] RAG passages              no cache (per-query)
//   [3] task instructions         no cache (per-call)

import { STRAND_PERSONA } from "./strand-persona.ts";
import { CHAPTER_WHITELIST_PROMPT } from "./book-chapters.ts";
import {
  renderTopicBlock,
  selectTopicsForContext,
  type SelectorContext,
} from "./knowledge/index.ts";
import type { TopicId } from "./knowledge/types.ts";
import { renderPassageBlock, retrievePassages } from "./rag.ts";
import { VOICE_PRINCIPLES } from "./voice.ts";
import type {
  ClaudeCallInput,
  ClaudeModel,
  ContentBlockInput,
  Message,
  ServerTool,
  SystemBlock,
  Tool,
} from "./anthropic-client.ts";

/** Function-id used to pick the default model. `claude-smoke` is the Step-0
 *  smoke test; deleted at Phase 2 close-out per audit §8 Step 25/29. */
export type FunctionKind =
  | "ingredient-analysis"
  | "product-analyse"
  | "product-analyse-url"
  | "tool-analyse-url"
  | "wash-day-observation"
  | "heat-treatment-rationale"
  | "nutrition-plan"
  | "blood-ai-summary"
  | "journal-encouragement"
  | "claude-smoke";

/** Default model per function. Phase 2 §5. Override per-call via
 *  BuildPromptInput.model when needed (e.g. cheaper tier for a force-refresh). */
export const FUNCTION_MODEL_MAP: Record<FunctionKind, ClaudeModel> = {
  "ingredient-analysis": "claude-sonnet-4-6",
  "product-analyse": "claude-sonnet-4-6",
  "product-analyse-url": "claude-sonnet-4-6",
  "tool-analyse-url": "claude-haiku-4-5-20251001",
  "wash-day-observation": "claude-haiku-4-5-20251001",
  "heat-treatment-rationale": "claude-haiku-4-5-20251001",
  "nutrition-plan": "claude-opus-4-7",
  "blood-ai-summary": "claude-opus-4-7",
  "journal-encouragement": "claude-haiku-4-5-20251001",
  "claude-smoke": "claude-sonnet-4-6",
};

export interface BuildPromptInput {
  function_kind: FunctionKind;
  task_instructions: string;
  user_context?: Record<string, unknown> | null;
  user_payload: Record<string, unknown>;
  /** Selector context for the KB. Pulled from buildAiContext()'s shape;
   *  see knowledge/index.ts SelectorContext for the exact subset used. */
  selector_context?: SelectorContext;
  /** Explicit KB topic ids to force-include regardless of context match.
   *  Useful e.g. for wash-day-observation always wanting wash-day-mechanics. */
  force_topic_ids?: TopicId[];
  /** Pre-rendered KB blocks. Bypasses the selector — for callers that
   *  want full control. If provided, selector is skipped. */
  knowledge_blocks?: string[];
  /** RAG query string. When set, retrievePassages(rag_query, rag_k ?? 4)
   *  is called and the passages are rendered into systemBlocks[2]. */
  rag_query?: string;
  rag_k?: number;
  /** Pre-rendered RAG blocks. Bypasses retrieval. */
  rag_blocks?: string[];
  /** Tool definition for structured-output (tool_use). When set, also pass toolChoice. */
  tool?: Tool;
  /** Additional Anthropic-managed server tools (e.g. native web_search).
   *  Combined with `tool` into the request `tools` array. Audit §5 Step 3
   *  uses this for `product-analyse`'s web_search support. */
  server_tools?: ServerTool[];
  toolChoice?: { type: "tool"; name: string };
  max_tokens?: number;
  /** Override the default model for this function. */
  model?: ClaudeModel;
  /** Override the user message content. When set, replaces the default
   *  JSON-stringified `{ payload, context }` body — used by vision flows
   *  that need to interleave image + text content blocks. The composer
   *  still owns the system blocks (persona, KB, RAG, task instructions). */
  user_content?: string | ContentBlockInput[];
}

/** Build a fully-formed ClaudeCallInput. The caller passes the result to
 *  callClaude() from anthropic-client.ts.
 *
 *  This is async because RAG retrieval (when rag_query is set) embeds the
 *  query and queries the vector index. KB-selector + persona-only paths
 *  remain effectively synchronous — no network calls. */
export async function buildClaudeRequest(
  input: BuildPromptInput,
): Promise<ClaudeCallInput> {
  const systemBlocks: SystemBlock[] = [
    {
      type: "text",
      text: STRAND_PERSONA,
      cache_control: { type: "ephemeral" },
    },
    {
      // Authoritative chapter whitelist — added 2026-04-27 after a
      // hallucinated "Chapter 4: The Truth About Deep Conditioners"
      // citation. Server-side sanitiser strips any non-whitelisted
      // citation as a final safety net (see book-chapters.ts).
      type: "text",
      text: CHAPTER_WHITELIST_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  // ── Knowledge base ────────────────────────────────────────────────
  let kbBlocks: string[] = [];
  if (input.knowledge_blocks && input.knowledge_blocks.length > 0) {
    kbBlocks = input.knowledge_blocks.filter((s) => typeof s === "string" && s.length > 0);
  } else if (input.selector_context || input.force_topic_ids) {
    const topics = selectTopicsForContext(input.selector_context ?? {}, {
      function_kind: input.function_kind === "claude-smoke" ? "ingredient-analysis" : input.function_kind,
      force: input.force_topic_ids,
    });
    kbBlocks = topics.map(renderTopicBlock);
  }
  if (kbBlocks.length > 0) {
    systemBlocks.push({
      type: "text",
      text: `KNOWLEDGE BASE\n\n${kbBlocks.join("\n\n---\n\n")}`,
      cache_control: { type: "ephemeral" },
    });
  }

  // ── RAG passages ──────────────────────────────────────────────────
  let ragBlocks: string[] = [];
  if (input.rag_blocks && input.rag_blocks.length > 0) {
    ragBlocks = input.rag_blocks.filter((s) => typeof s === "string" && s.length > 0);
  } else if (input.rag_query && input.rag_query.trim().length > 0) {
    const passages = await retrievePassages(input.rag_query, input.rag_k ?? 4);
    ragBlocks = passages.map(renderPassageBlock);
  }
  if (ragBlocks.length > 0) {
    systemBlocks.push({
      type: "text",
      text: `RETRIEVED PASSAGES\n\n${ragBlocks.join("\n\n---\n\n")}`,
    });
  }

  // ── VOICE PRINCIPLES (every Claude-path function) ────────────────
  // Conversational clinician voice. Per Step 9 voice-rewrite spec.
  systemBlocks.push({
    type: "text",
    text:
      `VOICE — HOW PAIGE TALKS TO THE USER\n\n` +
      `You are a clinical hair coach who happens to be talking to a friend. Warm, specific, never saccharine.\n\n` +
      `1. EXPLANATION-FIRST, NOT DECLARATION-FIRST. Don't open with a verdict and stop. Show the mechanism first, then land the point. ` +
      `Bad: "Avoid this." Good: "This sits high in the formula and your strands are already coated from yesterday's leave-in, which is why it's likely to feel heavy."\n\n` +
      `2. USE CONNECTIVES. The phrases "this means", "which is why", "so", "because" are how a clinician thinks out loud. Use them to link cause to effect in almost every sentence that carries a recommendation. The user should feel they were walked from A to B, not handed a conclusion.\n\n` +
      `3. SAY "YOU", NOT "YOUR HAIR". Talk to the person, not their strands. ` +
      `Bad: "Your hair will love this." Good: "You'll probably notice this lays softer by day three." ` +
      `"Your hair / your strands" is allowed only when the strand itself is the literal subject of a sentence about its physical structure (e.g. "your strands are high porosity, which means…").\n\n` +
      `4. NO JARGON WITHOUT IMMEDIATE TRANSLATION. Cosmetic-chemistry terms are fine — but the FIRST time one appears in any output field, it gets a half-sentence translation in plain English. ` +
      `Good: "Glycerin is a humectant — it pulls water from the air toward your strands, which is why…" ` +
      `Bad: "Contains glycerin — humectant." Once translated in a field, you can use the term again in that same field without re-translating.\n\n` +
      `5. WARM, NOT SACCHARINE. No "queen", "you've got this", "amazing job", "love that for you", excess exclamation marks, or generic affirmation. Warmth comes from being SPECIFIC to this user, not from praise words.\n\n` +
      `6. NO HEDGING STACKS. "You might want to consider possibly trying" is four hedges. One is plenty. Pick a position and explain why.\n\n` +
      `7. SHORTER IS BETTER WHEN THE DATA IS THIN. If you can't ground a sentence in this user's actual profile, cut it. Don't pad with generic context.`,
  });

  // ── Personalisation anchor (product flows) ───────────────────────
  // Same anchor as before (CURRENT style / goals / challenges) but voiced
  // as the clinician thinking out loud, not as a directive list.
  if (
    (input.function_kind === "product-analyse" ||
      input.function_kind === "product-analyse-url") &&
    input.user_context
  ) {
    const ctx = input.user_context as Record<string, unknown>;
    const cs = (ctx.currentStyle ?? null) as Record<string, unknown> | null;
    const styleStr = cs
      ? (cs.current_hairstyle as string | null) ??
        (cs.default_style as string | null) ??
        "not specified"
      : "not specified";
    const goalsArr = Array.isArray(ctx.goals)
      ? (ctx.goals as Array<Record<string, unknown>>)
      : [];
    const goalsStr = goalsArr.map((g) => g.title).filter(Boolean).join(", ") || "not specified";
    const challengesStr = goalsArr
      .map((g) => g.challenge)
      .filter((c) => typeof c === "string" && c.trim().length > 0)
      .join(", ") || "not specified";
    systemBlocks.push({
      type: "text",
      text:
        `PERSONALISATION — WHAT YOU KNOW ABOUT THIS USER RIGHT NOW\n\n` +
        `Right now, the user is wearing ${styleStr}. The goals they're actively working on are: ${goalsStr}. The challenges they've told you about are: ${challengesStr}.\n\n` +
        `Anchor what you say in those CURRENT values — that's how a coach who knows them would talk. ` +
        `Don't reach back to past styles, past goals, or past challenges; they're not the decision in front of you. ` +
        `And don't infer their hair state from the product itself — they're asking you about the product, not the other way around. ` +
        `If the product genuinely doesn't fit the style they're wearing right now, say so plainly in the verdict, then explain why in the next breath. The user would rather hear "this won't help your braids because…" than a polite non-answer.`,
    });
  }

  // ── Task instructions ────────────────────────────────────────────
  systemBlocks.push({
    type: "text",
    text: `TASK\n\n${input.task_instructions}`,
  });

  const defaultUserMessageJson = JSON.stringify(
    {
      payload: input.user_payload,
      context: input.user_context ?? null,
    },
    null,
    2,
  );

  const messages: Message[] = [
    {
      role: "user",
      content: input.user_content ?? defaultUserMessageJson,
    },
  ];

  // Combine the structured-output tool with any Anthropic-managed server
  // tools (e.g. native web_search for the photo flow).
  const tools: Array<Tool | ServerTool> = [];
  if (input.tool) tools.push(input.tool);
  if (input.server_tools && input.server_tools.length > 0) {
    tools.push(...input.server_tools);
  }

  return {
    model: input.model ?? FUNCTION_MODEL_MAP[input.function_kind],
    systemBlocks,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: input.toolChoice,
    max_tokens: input.max_tokens,
  };
}
