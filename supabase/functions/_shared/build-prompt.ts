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
import type {
  ClaudeCallInput,
  ClaudeModel,
  Message,
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
  /** KB topic bodies — Step 1 populates this; Step 0 callers pass [] or omit. */
  knowledge_blocks?: string[];
  /** RAG passages — Step 1 populates this; Step 0 callers pass [] or omit. */
  rag_blocks?: string[];
  /** Tool definition for structured-output (tool_use). When set, also pass toolChoice. */
  tool?: Tool;
  toolChoice?: { type: "tool"; name: string };
  max_tokens?: number;
  /** Override the default model for this function. */
  model?: ClaudeModel;
}

/** Build a fully-formed ClaudeCallInput. The caller passes the result to
 *  callClaude() from anthropic-client.ts. */
export function buildClaudeRequest(input: BuildPromptInput): ClaudeCallInput {
  const systemBlocks: SystemBlock[] = [
    {
      type: "text",
      text: STRAND_PERSONA,
      cache_control: { type: "ephemeral" },
    },
  ];

  const kb = (input.knowledge_blocks ?? []).filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  if (kb.length > 0) {
    systemBlocks.push({
      type: "text",
      text: `KNOWLEDGE BASE\n\n${kb.join("\n\n---\n\n")}`,
      cache_control: { type: "ephemeral" },
    });
  }

  const rag = (input.rag_blocks ?? []).filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  if (rag.length > 0) {
    systemBlocks.push({
      type: "text",
      text: `RETRIEVED PASSAGES\n\n${rag.join("\n\n---\n\n")}`,
    });
  }

  systemBlocks.push({
    type: "text",
    text: `TASK\n\n${input.task_instructions}`,
  });

  const userMessageJson = JSON.stringify(
    {
      payload: input.user_payload,
      context: input.user_context ?? null,
    },
    null,
    2,
  );

  const messages: Message[] = [
    { role: "user", content: userMessageJson },
  ];

  return {
    model: input.model ?? FUNCTION_MODEL_MAP[input.function_kind],
    systemBlocks,
    messages,
    tools: input.tool ? [input.tool] : undefined,
    toolChoice: input.toolChoice,
    max_tokens: input.max_tokens,
  };
}
