// STEP 1 (2026-09-04) — stop hiding scan failures.
//
// Product scans used to fail behind a generic "Couldn't analyse" with a 500
// body of {"error":"AI request failed"}. That told us nothing about WHICH
// failure mode we were looking at (upstream timeout, tool-use miss, JSON /
// schema failure, guardrail budget), so this module records the real error
// against public.scan_errors AND returns the same detail in the response
// payload so the client can surface it.
//
// Hard rules:
//  - Never throws. A failed diagnostics write must never change what the
//    member sees.
//  - Never records member content: no photo bytes, no analysis body, no
//    ingredient names — only the count.

declare const Deno: { env: { get(key: string): string | undefined } };

import { corsHeaders } from "./cors.ts";
import { aiErrorResponse } from "./errors.ts";

export interface ScanErrorDiagnostics {
  /** Edge function that failed, e.g. "product-analyse". */
  function_name: string;
  /** Which stage of the pipeline we were in when it blew up. */
  phase: string;
  user_id?: string | null;
  /** Wall-clock ms from request start to failure. */
  elapsed_ms?: number | null;
  /** Ingredients read off the label before the failure, when known. */
  ingredient_count?: number | null;
  /** Free-form extras (attempt number, provider, generation id…). Never content. */
  meta?: Record<string, unknown> | null;
}

export interface ScanErrorRecord extends ScanErrorDiagnostics {
  error_name: string;
  error_message: string;
  status_code: number | null;
}

const nameOf = (e: unknown): string => {
  if (e instanceof Error) return e.name || "Error";
  if (e && typeof e === "object" && "name" in e) {
    return String((e as { name: unknown }).name);
  }
  return typeof e;
};

const messageOf = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
};

const statusOf = (e: unknown): number | null => {
  if (!e || typeof e !== "object") return null;
  const m = e as { status?: unknown; statusCode?: unknown };
  if (typeof m.status === "number") return m.status;
  if (typeof m.statusCode === "number") return m.statusCode;
  return null;
};

/** Shape the error into a loggable, member-safe record. */
export function describeScanError(
  e: unknown,
  diag: ScanErrorDiagnostics,
): ScanErrorRecord {
  return {
    ...diag,
    error_name: nameOf(e),
    error_message: messageOf(e).slice(0, 1000),
    status_code: statusOf(e),
  };
}

/** Write one row to public.scan_errors. Fire-and-forget; never throws. */
export async function logScanError(record: ScanErrorRecord): Promise<void> {
  console.error(JSON.stringify({ event: "scan_error", ...record }));
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("scan_errors").insert({
      function_name: record.function_name,
      phase: record.phase,
      user_id: record.user_id ?? null,
      error_name: record.error_name,
      error_message: record.error_message,
      status_code: record.status_code,
      elapsed_ms: record.elapsed_ms ?? null,
      ingredient_count: record.ingredient_count ?? null,
      meta: record.meta ?? null,
    });
  } catch (writeErr) {
    console.error(
      `[scan-error-log] could not record diagnostics: ${messageOf(writeErr)}`,
    );
  }
}

/**
 * The standard AI error response, plus the real diagnostics in the body, plus
 * a row in public.scan_errors. Same status codes and same `error` string as
 * aiErrorResponse — only additive fields.
 */
export async function scanErrorResponse(
  e: unknown,
  diag: ScanErrorDiagnostics,
): Promise<Response> {
  const record = describeScanError(e, diag);
  await logScanError(record);

  const base = aiErrorResponse(e, diag.function_name);
  let body: Record<string, unknown> = { error: "AI request failed" };
  try {
    body = (await base.json()) as Record<string, unknown>;
  } catch { /* non-JSON body — keep the fallback */ }

  // Member-facing sentence + machine code, at the real HTTP status. Never the
  // upstream text, never a bare throw.
  const status = base.status;
  const code = status === 429
    ? "rate_limited"
    : status === 529 || status === 503
    ? "model_overloaded"
    : status === 502
    ? "ai_unavailable"
    : status === 400
    ? "bad_request"
    : "analysis_failed";
  const message = status === 429
    ? "Our AI is busy right now, so this analysis didn't run. Nothing has been saved — please try again in a moment."
    : status === 529 || status === 503
    ? "The AI is overloaded right now, so this analysis didn't finish. Nothing has been saved — please try again shortly."
    : status === 400
    ? "We couldn't analyse this product with the details we hold. Nothing has been saved — check the ingredients and try again."
    : "We couldn't finish this analysis just now. Nothing has been saved — please try again.";

  return new Response(
    JSON.stringify({
      ...body,
      message,
      code,
      diagnostics: {
        function: record.function_name,
        phase: record.phase,
        error_name: record.error_name,
        error_message: record.error_message,
        status_code: record.status_code,
        elapsed_ms: record.elapsed_ms ?? null,
        ingredient_count: record.ingredient_count ?? null,
        ...(record.meta ?? {}),
      },
    }),

    {
      status: base.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** Count ingredients in a partially-streamed tool JSON blob (best effort). */
export function countPartialIngredients(accumulated: string): number | null {
  const at = accumulated.indexOf('"ingredients"');
  if (at === -1) return null;
  const open = accumulated.indexOf("[", at);
  if (open === -1) return null;
  const close = accumulated.indexOf("]", open);
  const slice = accumulated.slice(open + 1, close === -1 ? undefined : close);
  const items = slice.match(/"(?:[^"\\]|\\.)*"/g);
  return items ? items.length : 0;
}

/**
 * OUTERMOST GUARD (2026-09-04).
 *
 * `scan_errors` stayed empty through days of real failures because every
 * function's diagnostics lived INSIDE its own try block: a throw from body
 * parsing, a missing env var, the kill switch, auth resolution or the time
 * budget set-up happened before the try and travelled out of the isolate
 * unlogged, as a bare 500 with no body the client could read.
 *
 * Wrap the whole handler in this and nothing can throw past it. Every failure
 * gets a scan_errors row and a JSON body carrying a member-facing `message`
 * and a machine `code` at the real HTTP status.
 */
export function withScanDiagnostics(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const t0 = Date.now();
    try {
      return await handler(req);
    } catch (e) {
      return await scanErrorResponse(e, {
        function_name: functionName,
        phase: "unhandled",
        elapsed_ms: Date.now() - t0,
      });
    }
  };
}
