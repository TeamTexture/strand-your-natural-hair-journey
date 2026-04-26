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

export interface ClaudeCallInput {
  model: ClaudeModel;
  systemBlocks: SystemBlock[];
  messages: Message[];
  tools?: Tool[];
  toolChoice?: { type: "tool"; name: string };
  max_tokens?: number;
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
  type: "text" | "tool_use";
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

  let resp: ClaudeApiResponse;
  try {
    resp = await postOnce(apiKey, body);
  } catch (err) {
    if (err instanceof ClaudeError && err.status === 529) {
      await sleep(750);
      resp = await postOnce(apiKey, body);
    } else {
      throw err;
    }
  }

  const result: ClaudeCallResult<T> = {
    usage: {
      input_tokens: resp.usage?.input_tokens ?? 0,
      cache_read_input_tokens: resp.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: resp.usage?.cache_creation_input_tokens ?? 0,
      output_tokens: resp.usage?.output_tokens ?? 0,
    },
    stop_reason: resp.stop_reason,
  };

  // Tool use block (preferred when toolChoice provided)
  const toolBlock = resp.content.find((b) => b.type === "tool_use");
  if (toolBlock?.input !== undefined) {
    result.toolInput = toolBlock.input as T;
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
