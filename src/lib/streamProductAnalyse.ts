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

export async function streamProductAnalyse(opts: {
  body: Record<string, unknown>;
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
    } catch { /* non-JSON */ }
    throw new ProductAnalyseError(message);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let final: Record<string, unknown> | null = null;
  let failure: string | null = null;

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
        failure = parsed.body?.error ?? "Something went wrong analysing this product.";
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
      else if (line.startsWith("data:")) handle(line.slice(5).trim());
      nl = buffer.indexOf("\n");
    }
  }

  if (failure) throw new ProductAnalyseError(failure);
  if (!final) {
    throw new ProductAnalyseError(
      "The analysis was interrupted before it finished. Please try again.",
    );
  }
  return final;
}
