// AI RETRY POLICY — transport failures may be retried, rejected generations may not.
// =================================================================================
// 2026-08-26, at the author's instruction. Removing every client retry made the
// error card MORE visible: a single dropped request now put "could not be
// prepared just now" in front of her, even though nothing had been generated and
// nothing had been paid for.
//
// The two failure cases are not the same thing:
//
//   TRANSPORT FAILURE          no HTTP response, or an infrastructure status
//                              (408 / 502 / 504 / 522 / 524). No model call
//                              completed, no tokens were spent. Retry ONCE with
//                              a short backoff — free when it succeeds, and it
//                              saves her an error card.
//
//   COMPLETED-BUT-REJECTED     the model produced output and a guardrail, the
//                              fidelity check or the parser rejected it. The
//                              expensive work already happened. NEVER retried:
//                              the surface falls through to her last good
//                              output, or to the honest 503.
//
// Edge functions signal the second case explicitly: 503 `guidance_unavailable`,
// or a 200 with an empty result. Rate limiting (429) and credit exhaustion (402)
// are also never retried — retrying walks into the same wall.

/** Thrown when the request never reached a completed generation. Retryable. */
export class AiTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransportError";
  }
}

/** Thrown when a generation completed and was then rejected. NOT retryable. */
export class AiRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRejectedError";
  }
}

/** Infrastructure statuses: the request died in transit, nothing was generated. */
const TRANSPORT_STATUSES = new Set([408, 502, 504, 522, 524]);

const TRANSPORT_MESSAGE =
  /failed to fetch|failed to send a request|network ?error|load failed|networkerror|connection (closed|reset|refused)|econn|socket hang up|aborted|abort ?error|timed? ?out|timeout/i;

/**
 * Classify an error returned by `supabase.functions.invoke`. Async because a
 * non-2xx FunctionsHttpError carries its body on a Response that has to be read
 * before we can tell a 503 "the generation was rejected" apart from a 503 that
 * the platform itself produced.
 */
export async function classifyInvokeError(error: unknown): Promise<Error> {
  const err = error as
    | { name?: string; message?: string; context?: unknown }
    | null
    | undefined;
  const message = String(err?.message ?? "invocation failed");
  const name = String(err?.name ?? "");

  // FunctionsHttpError — the function answered. Its status and body decide.
  const ctx = err?.context as { status?: number; clone?: () => Response } | undefined;
  const status = typeof ctx?.status === "number" ? ctx.status : undefined;
  if (typeof status === "number") {
    if (TRANSPORT_STATUSES.has(status)) {
      return new AiTransportError(`transport status ${status}`);
    }
    // Anything the function itself decided — 503 guidance_unavailable, 429,
    // 402, 4xx validation — is a completed decision, not a transport fault.
    let detail = "";
    try {
      const body = await (ctx as { clone?: () => Response }).clone?.()?.json();
      detail = String((body as { error?: string } | null)?.error ?? "");
    } catch {
      /* body already consumed or not JSON — status alone is enough */
    }
    return new AiRejectedError(detail ? `${status} ${detail}` : `status ${status}`);
  }

  // No response at all — fetch/relay layer.
  if (
    name === "FunctionsFetchError" ||
    name === "FunctionsRelayError" ||
    name === "AbortError" ||
    name === "TypeError" ||
    TRANSPORT_MESSAGE.test(message)
  ) {
    return new AiTransportError(message);
  }

  // Unknown shape: treat as rejected. Never retry into the unknown.
  return new AiRejectedError(message);
}

/** True only for failures where no generation completed. */
export function isTransportFailure(error: unknown): boolean {
  if (error instanceof AiTransportError) return true;
  if (error instanceof AiRejectedError) return false;
  const err = error as { name?: string; message?: string } | null | undefined;
  if (err?.name === "AiTransportError") return true;
  if (err?.name === "AiRejectedError") return false;
  return TRANSPORT_MESSAGE.test(String(err?.message ?? ""));
}

/**
 * React Query `retry` for paid AI surfaces: at most ONE retry, and only when
 * nothing was generated. Pair with `aiRetryDelay`.
 */
export const retryTransportOnce = (failureCount: number, error: unknown): boolean =>
  failureCount < 1 && isTransportFailure(error);

/** Short backoff — a transport blip clears in well under a second. */
export const aiRetryDelay = () => 400;
