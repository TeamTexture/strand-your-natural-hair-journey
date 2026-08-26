// Typed wrapper around Anthropic's HTTP API for Deno edge functions.
// Audit PHASE_2_AUDIT.md §4.2.
//
// Reads ANTHROPIC_API_KEY from Deno.env at call time (not module init) so a
// secret rotation in Lovable Cloud Secrets takes effect on the next
// invocation without a redeploy. Builds the `system` array with
// cache_control ephemeral on the long, stable prefix (persona + KB) and
// leaves per-call instructions / RAG passages uncached. Single retry on 529
// only; 429 is propagated to the client without retry so the user sees
// backoff rather than silent stalls.
//
// We use direct fetch rather than the official @anthropic-ai/sdk so this
// runs cleanly in Deno without esm.sh polyfilling Node-specific surfaces.
// Throws ClaudeError on upstream failure; callers should pass through
// aiErrorResponse() in errors.ts.

import { logAiCall, type AiCallMeta } from "./ai-meter.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type ClaudeModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export type ImageBlockSource =
  | {
      type: "base64";
      media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      data: string;
    }
  | { type: "url"; url: string };

export type ContentBlockInput =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageBlockSource }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlockInput[];
}

export interface Tool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

/** Anthropic-managed server-side tool. The model invokes it autonomously
 *  inside a single API call; results come back as `server_tool_use` plus a
 *  matching `*_tool_result` content block before the final assistant
 *  response. We pass these straight through to the API.
 *  Audit PHASE_2_AUDIT.md §5 Step 3 (web_search) + §5 Step 4a (web_fetch +
 *  web_search) — tight max_uses cap to bound cost. */
export type ServerTool =
  | {
      type: "web_search_20250305";
      name: "web_search";
      max_uses?: number;
    }
  | {
      type: "web_fetch_20250910";
      name: "web_fetch";
      max_uses?: number;
    };

export interface ClaudeCallInput {
  model: ClaudeModel;
  systemBlocks: SystemBlock[];
  messages: Message[];
  /** Caller-defined tools (`tool_use`) AND Anthropic server tools mixed
   *  together in one array — Anthropic's API takes them in the same
   *  `tools` field, distinguished by the presence of a `type` discriminator
   *  on server tools. */
  tools?: Array<Tool | ServerTool>;
  toolChoice?: { type: "tool"; name: string };
  max_tokens?: number;
  /** Cost-meter attribution (Phase 2). Observation only — never affects the
   *  request sent to Anthropic. Populated by buildClaudeRequest. */
  meta?: AiCallMeta;
  /**
   * SPEED (2026-08): when provided, the request is made with `stream: true`
   * and this callback receives the accumulated tool-input JSON string as it
   * arrives, so the caller can surface partial results (product name, brand,
   * ingredients) to the member seconds before the full verdict finishes.
   * Everything else — parsing, guardrails, the returned result shape — is
   * identical to the non-streaming path.
   */
  onPartialJson?: (accumulatedJson: string) => void;

}

export interface ClaudeUsage {
  input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
}

export interface ClaudeCallResult<T = unknown> {
  /** Parsed tool input — populated when toolChoice was set and Claude returned a tool_use block. */
  toolInput?: T;
  /** Free-text response — populated when no toolChoice was set. */
  text?: string;
  usage: ClaudeUsage;
  stop_reason: string;
  /** Count of `server_tool_use` blocks Anthropic executed on Claude's behalf
   *  (e.g. native web_search invocations). Useful for cost logging and
   *  surfacing `_used_web_search` provenance in cached payloads. */
  server_tool_use_count?: number;
  /** Per-tool breakdown of `server_tool_use` invocations keyed by tool
   *  name (e.g. `{ web_search: 2, web_fetch: 1 }`). Audit §5 Step 4a
   *  needs this to stamp `_used_web_fetch` separately from
   *  `_used_web_search` on the URL flow. */
  server_tool_use_by_name?: Record<string, number>;
  /** Search query strings the model issued, in order. Safe to log — they
   *  contain only product names / brand context, no user PII. Empty when
   *  no server tools fired. */
  server_tool_use_queries?: string[];
}

/** Error class carrying the upstream HTTP status so aiErrorResponse() can map it. */
export class ClaudeError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Anthropic API ${status}: ${body.slice(0, 200)}`);
    this.name = "ClaudeError";
    this.status = status;
    this.body = body;
  }
}

interface ClaudeApiContentBlock {
  type:
    | "text"
    | "tool_use"
    | "server_tool_use"
    | "web_search_tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface ClaudeApiResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeApiContentBlock[];
  model: string;
  stop_reason: string;
  usage?: Partial<ClaudeUsage>;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function postOnce(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ClaudeApiResponse> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new ClaudeError(resp.status, errBody);
  }
  return (await resp.json()) as ClaudeApiResponse;
}

/**
 * Streaming variant of postOnce. Reads Anthropic's SSE stream, reassembles
 * exactly the same ClaudeApiResponse shape the non-streaming call returns, and
 * calls `onPartialJson` with the accumulated tool-input JSON as deltas land.
 * Nothing downstream changes — the caller still receives a fully parsed result.
 */
async function postStream(
  apiKey: string,
  body: Record<string, unknown>,
  onPartialJson: (accumulatedJson: string) => void,
): Promise<ClaudeApiResponse> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!resp.ok || !resp.body) {
    const errBody = resp.body ? await resp.text() : "no stream body";
    throw new ClaudeError(resp.status, errBody);
  }

  const out: ClaudeApiResponse = {
    id: "",
    type: "message",
    role: "assistant",
    content: [],
    model: String(body.model ?? ""),
    stop_reason: "",
    usage: {},
  };
  // Per-index accumulators for the blocks that arrive as deltas.
  const partialJson = new Map<number, string>();
  const partialText = new Map<number, string>();

  const handleEvent = (payload: string) => {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = ev.type as string;
    if (type === "message_start") {
      const msg = ev.message as ClaudeApiResponse | undefined;
      if (msg) {
        out.id = msg.id ?? "";
        out.model = msg.model ?? out.model;
        out.usage = { ...(msg.usage ?? {}) };
      }
      return;
    }
    if (type === "content_block_start") {
      const index = ev.index as number;
      const block = { ...(ev.content_block as ClaudeApiContentBlock) };
      out.content[index] = block;
      if (block.type === "tool_use" || block.type === "server_tool_use") {
        partialJson.set(index, "");
      } else if (block.type === "text") {
        partialText.set(index, block.text ?? "");
      }
      return;
    }
    if (type === "content_block_delta") {
      const index = ev.index as number;
      const delta = ev.delta as { type?: string; partial_json?: string; text?: string };
      if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const next = (partialJson.get(index) ?? "") + delta.partial_json;
        partialJson.set(index, next);
        // Only the caller-defined tool is worth surfacing; server tools
        // (web_search) emit query JSON the member never sees.
        if (out.content[index]?.type === "tool_use") {
          try {
            onPartialJson(next);
          } catch {
            // A failing consumer must never break the model call.
          }
        }
      } else if (delta?.type === "text_delta" && typeof delta.text === "string") {
        partialText.set(index, (partialText.get(index) ?? "") + delta.text);
      }
      return;
    }
    if (type === "content_block_stop") {
      const index = ev.index as number;
      const block = out.content[index];
      if (!block) return;
      const raw = partialJson.get(index);
      if (raw !== undefined && (block.type === "tool_use" || block.type === "server_tool_use")) {
        try {
          block.input = raw.trim() ? JSON.parse(raw) : {};
        } catch {
          block.input = undefined;
        }
      }
      const text = partialText.get(index);
      if (text !== undefined && block.type === "text") block.text = text;
      return;
    }
    if (type === "message_delta") {
      const delta = ev.delta as { stop_reason?: string } | undefined;
      if (delta?.stop_reason) out.stop_reason = delta.stop_reason;
      const usage = ev.usage as Partial<ClaudeUsage> | undefined;
      if (usage) out.usage = { ...(out.usage ?? {}), ...usage };
      return;
    }
    if (type === "error") {
      const err = ev.error as { message?: string } | undefined;
      throw new ClaudeError(500, err?.message ?? "anthropic stream error");
    }
  };

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
      nl = buffer.indexOf("\n");
    }
  }

  out.content = out.content.filter(Boolean);
  return out;
}



/**
 * Call Claude. Returns either the parsed tool input (when toolChoice was
 * provided) or the free-text response. Single retry on 529 only.
 */
export async function callClaude<T = unknown>(
  input: ClaudeCallInput,
): Promise<ClaudeCallResult<T>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new ClaudeError(401, "ANTHROPIC_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.max_tokens ?? 2048,
    system: input.systemBlocks,
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
  }
  if (input.toolChoice) {
    body.tool_choice = input.toolChoice;
  }

  const meterT0 = Date.now();
  let resp: ClaudeApiResponse;
  const post = input.onPartialJson
    ? (b: Record<string, unknown>) => postStream(apiKey, b, input.onPartialJson!)
    : (b: Record<string, unknown>) => postOnce(apiKey, b);
  try {
    try {
      resp = await post(body);
    } catch (err) {
      if (err instanceof ClaudeError && err.status === 529) {
        await sleep(750);
        resp = await post(body);
      } else {
        throw err;
      }
    }

  } catch (err) {
    // Cost meter (Phase 2): record the failed attempt, then rethrow unchanged.
    if (input.meta) {
      logAiCall({
        ...input.meta,
        provider: "anthropic",
        model: input.model,
        outcome: "error",
        duration_ms: Date.now() - meterT0,
        http_status: err instanceof ClaudeError ? err.status : null,
        error_text: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }

  // Cost meter (Phase 2). Stage-2 rows buffer until the guardrails report an
  // outcome; stage-1 rows are written straight away.
  if (input.meta) {
    logAiCall({
      ...input.meta,
      provider: "anthropic",
      model: input.model,
      duration_ms: Date.now() - meterT0,
      input_tokens: resp.usage?.input_tokens ?? null,
      output_tokens: resp.usage?.output_tokens ?? null,
      cache_read_tokens: resp.usage?.cache_read_input_tokens ?? null,
      cache_write_tokens: resp.usage?.cache_creation_input_tokens ?? null,
    });
  }

  // Count Anthropic-managed server-tool invocations (e.g. native web_search).
  // These come back as `server_tool_use` content blocks before the final
  // assistant tool_use / text. Useful for cost logging and `_used_web_search`
  // provenance on cached payloads (audit §5 Step 3).
  const serverToolBlocks = resp.content.filter((b) => b.type === "server_tool_use");
  const serverToolQueries: string[] = serverToolBlocks
    .map((b) => {
      const inp = b.input as { query?: unknown } | undefined;
      return typeof inp?.query === "string" ? inp.query : "";
    })
    .filter((q) => q.length > 0);
  const serverToolByName: Record<string, number> = {};
  for (const b of serverToolBlocks) {
    const n = typeof b.name === "string" && b.name ? b.name : "unknown";
    serverToolByName[n] = (serverToolByName[n] ?? 0) + 1;
  }

  const result: ClaudeCallResult<T> = {
    usage: {
      input_tokens: resp.usage?.input_tokens ?? 0,
      cache_read_input_tokens: resp.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: resp.usage?.cache_creation_input_tokens ?? 0,
      output_tokens: resp.usage?.output_tokens ?? 0,
    },
    stop_reason: resp.stop_reason,
    server_tool_use_count: serverToolBlocks.length,
    server_tool_use_by_name: serverToolByName,
    server_tool_use_queries: serverToolQueries,
  };

  // Tool use block (preferred when toolChoice provided). Prefer the named
  // tool when toolChoice is set so we don't accidentally pick up a
  // `server_tool_use` from `web_search` (those are filtered above by type
  // discriminator, but we double-check by name).
  const wantedName = input.toolChoice?.name;
  const toolBlock =
    (wantedName
      ? resp.content.find((b) => b.type === "tool_use" && b.name === wantedName)
      : undefined) ??
    resp.content.find((b) => b.type === "tool_use");
  if (toolBlock?.input !== undefined) {
    // Normalise: Opus occasionally wraps the tool arguments inside a single
    // top-level `input` key (mirroring OpenAI's function-calling envelope)
    // even though the schema doesn't declare it. Unwrap defensively so all
    // callers receive the schema-shaped object directly. Only unwrap when the
    // outer object has *exclusively* an `input` key whose value is an object —
    // never when a real schema property happens to be named `input`.
    const raw = toolBlock.input as unknown;
    let normalised: unknown = raw;
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw)
    ) {
      const keys = Object.keys(raw as Record<string, unknown>);
      // Known single-key envelopes Claude occasionally wraps the tool args in:
      //  - `input` (OpenAI-style function-calling mirror, mostly on Opus)
      //  - `$PARAMETER_VALUE` (observed on Sonnet/Haiku when the tool schema
      //    is presented with a placeholder parameter name)
      const ENVELOPE_KEYS = new Set(["input", "$PARAMETER_VALUE", "$PARAMETER_NAME"]);
      if (keys.length === 1 && ENVELOPE_KEYS.has(keys[0])) {
        const inner = (raw as Record<string, unknown>)[keys[0]];
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
          normalised = inner;
        }
      }

    }
    result.toolInput = normalised as T;
    return result;
  }

  // Free text
  const textBlock = resp.content.find((b) => b.type === "text");
  if (textBlock?.text != null) {
    result.text = textBlock.text;
    return result;
  }

  throw new ClaudeError(
    500,
    `Claude returned no text or tool_use block: ${JSON.stringify(resp.content).slice(0, 200)}`,
  );
}
