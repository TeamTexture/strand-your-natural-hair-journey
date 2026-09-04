import { supabase } from "@/integrations/supabase/client";

/**
 * SPEED (2026-08). The product verdict takes the model ~20–40s to write, but
 * the product name, brand and ingredient panel are decided in the first few
 * seconds. This client streams `product-analyse` over SSE so the member sees
 * those real details almost immediately instead of a spinner.
 *
 * Contract:
 *  - `onPartial` is a PREVIEW only. It receives whatever fields have finished
 *    arriving so far, parsed leniently from incomplete JSON. Never save it,
 *    never score from it.
 *  - The resolved value is the `complete` event payload — the same fully
 *    guarded, sanitised object the plain JSON response returns. That is the
 *    only payload that may be persisted.
 */

export interface PartialAnalysis {
  product_name?: string;
  brand?: string;
  category?: string;
  ingredients?: string[];
  match_score?: number;
  ai_summary?: string;
}

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Lenient reader for a truncated JSON object. Only pulls out the handful of
 * scalar/array fields the preview shows, and only once each is complete —
 * a half-written string is never surfaced.
 */
export function readPartialAnalysis(accumulated: string): PartialAnalysis {
  const out: PartialAnalysis = {};
  const str = (key: string): string | undefined => {
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(accumulated);
    if (!m) return undefined;
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return undefined;
    }
  };
  const name = str("product_name");
  if (name) out.product_name = name;
  const brand = str("brand");
  if (brand) out.brand = brand;
  const category = str("category");
  if (category) out.category = category;
  const summary = str("ai_summary");
  if (summary) out.ai_summary = summary;

  const score = /"match_score"\s*:\s*(\d{1,3})\s*[,}]/.exec(accumulated);
  if (score) out.match_score = Number(score[1]);

  // Ingredients: take every complete quoted entry inside the array, even if
  // the array itself hasn't closed yet — the count is what the member sees.
  const arrStart = accumulated.indexOf('"ingredients"');
  if (arrStart !== -1) {
    const open = accumulated.indexOf("[", arrStart);
    if (open !== -1) {
      const close = accumulated.indexOf("]", open);
      const slice = accumulated.slice(open + 1, close === -1 ? undefined : close);
      const items = slice.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
      const parsed = items
        .map((raw) => {
          try {
            return JSON.parse(raw) as string;
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      if (parsed.length) out.ingredients = parsed;
    }
  }
  return out;
}

export class ProductAnalyseError extends Error {}

/**
 * STEP 1 (2026-09-04): the edge function now returns real diagnostics alongside
 * its friendly message (phase, error name, status, elapsed ms, ingredients read).
 * We append a short technical tail so a failed scan can be diagnosed from the
 * screen instead of guessing between a timeout and a parse failure.
 */
function withDiagnostics(message: string, body: unknown): string {
  const d = (body as { diagnostics?: Record<string, unknown> } | null)?.diagnostics;
  if (!d) return message;
  const bits: string[] = [];
  if (d.phase) bits.push(String(d.phase));
  if (d.error_name) bits.push(String(d.error_name));
  if (d.status_code) bits.push(`status ${d.status_code}`);
  if (typeof d.elapsed_ms === "number") bits.push(`${Math.round(d.elapsed_ms / 1000)}s`);
  if (typeof d.ingredient_count === "number") bits.push(`${d.ingredient_count} ingredients read`);
  if (d.error_message && d.error_message !== message) bits.push(String(d.error_message));
  return bits.length ? `${message}\n\n(${bits.join(" · ")})` : message;
}

export async function streamProductAnalyse(opts: {
  body: Record<string, unknown>;
  /**
   * RECOVERY (2026-09-04): called when the stream ends without a `complete`
   * event. The finished analysis is persisted server-side before `complete` is
   * emitted, so a dropped connection is recoverable rather than lost work.
   */
  recover?: () => Promise<Record<string, unknown> | null>;
  /**
   * Which analysis function to stream. Defaults to the photo scan; the URL
   * scan streams the identical event contract (2026-09-03), so both surfaces
   * share this transport and parser rather than each rolling their own.
   */
  fn?: "product-analyse" | "product-analyse-url";
  onPartial?: (partial: PartialAnalysis) => void;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new ProductAnalyseError("Please sign in again to analyse a product.");

  const resp = await fetch(`${FUNCTIONS_BASE}/${opts.fn ?? "product-analyse"}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });

  if (!resp.ok || !resp.body) {
    // Non-2xx never streams (auth, kill switch, validation) — read the JSON
    // error body and surface Paige's message verbatim.
    let message = "Something went wrong analysing this product.";
    try {
      const body = (await resp.json()) as { error?: string };
      if (body?.error) message = body.error;
      message = withDiagnostics(message, body);
    } catch { /* non-JSON */ }
    throw new ProductAnalyseError(message);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let final: Record<string, unknown> | null = null;
  let failure: string | null = null;

  // EVENT TRACE (2026-09-04). The server logs every event it emits with a
  // sequence number; we log every event we receive. "complete was never
  // emitted" and "complete never arrived" are different failures, and the two
  // traces together say which one happened.
  const startedAt = Date.now();
  const received: Record<string, number> = {};
  let seq = 0;
  let lastEvent = "none";
  const note = (name: string) => {
    seq += 1;
    received[name] = (received[name] ?? 0) + 1;
    lastEvent = name;
    // Partials and heartbeats are frequent; log them at low volume.
    if (name !== "partial" || received.partial <= 3) {
      console.log("[scan-sse] received", {
        event: name,
        seq,
        at_ms: Date.now() - startedAt,
      });
    }
  };

  const handle = (data: string) => {
    if (event === "partial") {
      if (!opts.onPartial) return;
      try {
        const { json } = JSON.parse(data) as { json: string };
        opts.onPartial(readPartialAnalysis(json));
      } catch { /* preview only — ignore */ }
      return;
    }
    if (event === "complete") {
      try {
        final = JSON.parse(data) as Record<string, unknown>;
      } catch {
        failure = "The analysis came back unreadable. Please try again.";
      }
      return;
    }
    if (event === "error") {
      try {
        const parsed = JSON.parse(data) as { body?: { error?: string } };
        failure = withDiagnostics(
          parsed.body?.error ?? "Something went wrong analysing this product.",
          parsed.body,
        );
      } catch {
        failure = "Something went wrong analysing this product.";
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        note(event || "message");
        handle(line.slice(5).trim());
      }
      nl = buffer.indexOf("\n");
    }
  }

  const trace = {
    wall_ms: Date.now() - startedAt,
    events: { ...received },
    last_event: lastEvent,
    heartbeats: received.ping ?? 0,
    complete_received: (received.complete ?? 0) > 0,
  };
  console.log("[scan-sse] stream closed", trace);

  if (failure) throw new ProductAnalyseError(failure);
  if (!final) {
    // The stream ended with no terminal event. The analysis may nevertheless
    // have finished and been persisted — fetch it before failing.
    if (opts.recover) {
      try {
        const recovered = await opts.recover();
        if (recovered) {
          console.log("[scan-sse] recovered persisted analysis", {
            wall_ms: Date.now() - startedAt,
          });
          return recovered;
        }
      } catch (e) {
        console.error("[scan-sse] recovery lookup failed", e);
      }
    }
    throw new ProductAnalyseError(
      "The analysis was interrupted before it finished. Please try again." +
        `\n\n(stream closed after ${Math.round(trace.wall_ms / 1000)}s · last event ${
          trace.last_event
        } · ${trace.heartbeats} heartbeats · no complete)`,
    );
  }
  return final;
}
