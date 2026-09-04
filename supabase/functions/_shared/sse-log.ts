// SSE EVENT TRACE (2026-09-04)
// ============================
// A scan that ends with "the analysis was interrupted before it finished" has
// exactly two possible causes, and they are different bugs:
//   (a) the worker never emitted `complete`, or
//   (b) it emitted `complete` and the client never received it.
// Without a trace on both ends we cannot tell them apart, so every emitted
// event is logged here with a sequence number and a wall-clock offset, and the
// client logs every event it receives (see src/lib/streamProductAnalyse.ts).
//
// This wrapper NEVER changes the wire contract and NEVER touches the payload —
// no field is added to `complete`, so what the member saves is untouched. It
// also never throttles or deduplicates: only `partial` is throttled, inside
// _shared/partial-emitter.ts, and `complete` never travels that path.

export interface SseTrace {
  /** Wrapped emitter — same signature, logs each event. */
  send: (event: string, data: unknown) => void;
  /** How many events of each type were emitted. */
  counts: () => Record<string, number>;
  seq: () => number;
}

export function traceSse(
  send: (event: string, data: unknown) => void,
  functionName: string,
  startedAt: number = Date.now(),
): SseTrace {
  let seq = 0;
  const counts: Record<string, number> = {};
  return {
    send: (event, data) => {
      seq += 1;
      counts[event] = (counts[event] ?? 0) + 1;
      // Content is never logged — only the event name and the timing.
      console.log(JSON.stringify({
        function: functionName,
        event: "sse_emit",
        sse_event: event,
        seq,
        at_ms: Date.now() - startedAt,
      }));
      send(event, data);
    },
    counts: () => ({ ...counts }),
    seq: () => seq,
  };
}

/** Terminal marker: proves server-side whether `complete` left the worker. */
export function logStreamOutcome(
  functionName: string,
  outcome: "complete" | "error",
  trace: SseTrace,
  startedAt: number,
): void {
  console.log(JSON.stringify({
    function: functionName,
    event: "sse_stream_closed",
    outcome,
    wall_ms: Date.now() - startedAt,
    events: trace.counts(),
  }));
}
