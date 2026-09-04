// SHARED SSE WRAPPER (2026-09-03)
// ================================
// `product-analyse` already streamed its analysis back to the member so the
// real product name, brand and ingredient count replace cosmetic progress copy
// within a few seconds. The URL scan ran the same length of pipeline (measured
// p50 56.7s) with nothing on screen but a button spinner.
//
// This is the SAME wrapper product-analyse uses, lifted out verbatim so a
// second surface streams without inventing a second protocol:
//   event: open      — flushed immediately so the browser opens the stream
//   event: tier1     — deterministic findings known before the model call
//   event: partial   — accumulated tool JSON, PREVIEW ONLY, never saved
//   event: complete  — the final, fully guarded payload (the only saveable one)
//   event: error     — { status, body }
//
// The pipeline is unchanged in both modes: every gate, cache check, guardrail
// and cache write runs exactly as before. Streaming only changes when bytes
// leave the worker.

import { corsHeaders } from "./cors.ts";

export type SseEmit = (event: string, data: unknown) => void;

export function sseResponse(opts: {
  /** Runs the analysis. Receives the emitter; returns the payload or a Response. */
  pipeline: (emit: SseEmit) => Promise<Record<string, unknown> | Response>;
  /** Maps a thrown error to the function's normal error Response. */
  onError: (e: unknown) => Response;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseEmit = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Client went away mid-scan; the pipeline still finishes and writes
          // its cache row so the next open is free.
        }
      };
      send("open", { ok: true });
      try {
        const result = await opts.pipeline(send);
        if (result instanceof Response) {
          const text = await result.text();
          let parsed: unknown = { error: "request_failed" };
          try {
            parsed = JSON.parse(text);
          } catch { /* non-JSON body */ }
          send("error", { status: result.status, body: parsed });
        } else {
          send("complete", result);
        }
      } catch (e) {
        const resp = opts.onError(e);
        let parsed: unknown = { error: "analysis_failed" };
        try {
          parsed = JSON.parse(await resp.text());
        } catch { /* non-JSON body */ }
        send("error", { status: resp.status, body: parsed });
      } finally {
        try {
          controller.close();
        } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
