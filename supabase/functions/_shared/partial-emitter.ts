// THROTTLED PARTIAL EMISSION (2026-09-04)
// =======================================
// Anthropic's tool streaming fires an `input_json_delta` per token-ish chunk.
// The scan functions used to run a full-buffer regex AND a full-buffer
// JSON.stringify + TextEncoder.encode + enqueue on EVERY delta. For a 6-8k
// token answer that is ~2,000 events and tens of MB pushed to a phone — and it
// spent the edge worker's 2s CPU-time allowance, which kills the isolate
// instantly with no chance to send an `error` event. The member saw
// "The analysis was interrupted before it finished."
//
// The client only ever renders brand, product_name and the ingredient count
// from a partial, so re-sending the buffer thousands of times bought nothing.
//
// This wrapper keeps the wire contract identical (`event: partial`,
// `data: { json }`) and simply:
//   1. does no work at all more often than once every THROTTLE_MS,
//   2. skips the emit when the extracted preview has not changed,
//   3. stops emitting entirely once the `ingredients` array has closed — the
//      preview is complete at that point.

import { countPartialIngredients } from "./scan-error-log.ts";

/** Minimum wall-clock gap between two partial ticks. */
export const PARTIAL_THROTTLE_MS = 400;

/** Lenient read of one complete string field out of a truncated JSON buffer. */
function readString(acc: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(acc);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

/** Has the `ingredients` array finished arriving? */
function ingredientsClosed(acc: string): boolean {
  const at = acc.indexOf('"ingredients"');
  if (at === -1) return false;
  const open = acc.indexOf("[", at);
  if (open === -1) return false;
  return acc.indexOf("]", open) !== -1;
}

export function createPartialEmitter(
  emit: (event: string, data: unknown) => void,
  opts?: {
    /** Called with the ingredient count on the ticks where it is read. */
    onCount?: (count: number) => void;
    throttleMs?: number;
  },
): (accumulatedJson: string) => void {
  const throttleMs = opts?.throttleMs ?? PARTIAL_THROTTLE_MS;
  let lastTick = 0;
  let lastKey = "";
  let done = false;

  return (acc: string) => {
    if (done) return;
    const now = Date.now();
    if (now - lastTick < throttleMs) return;
    lastTick = now;

    const count = countPartialIngredients(acc);
    if (count !== null) opts?.onCount?.(count);
    const key = `${readString(acc, "brand") ?? ""}|${
      readString(acc, "product_name") ?? ""
    }|${count ?? -1}`;
    if (key === lastKey) return;
    lastKey = key;

    emit("partial", { json: acc });
    // Preview is complete — nothing after this changes what the member sees.
    if (ingredientsClosed(acc)) done = true;
  };
}

/**
 * HEARTBEAT (2026-09-04). Between the last partial and `complete` the pipeline
 * can be silent for 30-70s (guardrail retries, post-processing, cache writes).
 * Mobile networks and proxies drop idle streams. `ping` is an unknown event to
 * the client, which ignores it, so nothing else changes.
 */
export function startHeartbeat(
  emit: (event: string, data: unknown) => void,
  everyMs = 10_000,
): () => void {
  const id = setInterval(() => {
    try {
      emit("ping", {});
    } catch { /* stream gone */ }
  }, everyMs);
  return () => clearInterval(id);
}
