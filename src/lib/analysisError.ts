// One place to turn a failed analysis call into a sentence a member can read.
//
// 2026-09-04: the product page showed whatever string came back — including
// "Edge Function returned a non-2xx status code" and, when nothing came back at
// all, an endless spinner. The edge functions now answer every failure with
// { message, code } at the real status, so prefer that; otherwise fall back to
// a written sentence that states the outcome plainly.

import { memberSafeMessage } from "@/lib/invokeError";

const FALLBACK =
  "We couldn't finish this analysis just now. Nothing has been saved — please try again.";

type ErrorBody = { message?: unknown; error?: unknown; code?: unknown } | null | undefined;

/** Read the member-facing message off an edge-function error body. */
export function messageFromBody(body: ErrorBody): string | null {
  if (!body || typeof body !== "object") return null;
  const msg = (body as { message?: unknown }).message;
  if (typeof msg === "string" && msg.trim().length > 3) return msg;
  return null;
}

/**
 * Turn an invoke error (or a 200 body carrying an `error`) into member-facing
 * copy. Never surfaces SDK strings, Postgres codes or upstream provider text.
 */
export function analysisErrorMessage(err: unknown, body?: ErrorBody): string {
  return messageFromBody(body) ?? memberSafeMessage(err, FALLBACK);
}

export const ANALYSIS_ERROR_FALLBACK = FALLBACK;
