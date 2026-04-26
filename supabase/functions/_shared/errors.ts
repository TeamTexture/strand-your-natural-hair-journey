// Standard error mapping for AI calls. Maps upstream / unexpected failures
// to user-friendly JSON + the right HTTP status. Replaces the 10 different
// error-handling blocks across the legacy edge functions.
// Audit PHASE_2_AUDIT.md §4.2 (error mapping rules) and §4.6.
//
// Mapping rules:
//   401  → "AI auth failed (server-side configuration issue)" + 502 to client
//          (a 401 from upstream means OUR ANTHROPIC_API_KEY / config is wrong;
//          users should never see "auth failed" — that's a server problem)
//   429  → "Rate limit exceeded. Try again shortly." (preserves Lovable's mapping)
//   529  → "AI is overloaded right now. Try again shortly." (Anthropic-specific)
//   400  → propagate the upstream message (it's a schema/format problem we want
//          to see in logs, but the user gets the underlying reason)
//   else → 500 "AI request failed"
//
// CRITICAL: log error class + status only. Never log the upstream payload
// body — the audit §4 finding from blood-ai-summary's
// `console.error(JSON.stringify(aiJson).slice(0, 500))` was that truncated
// AI response can include user marker names and statuses. We do not log it.

import { json } from "./cors.ts";

interface MaybeStatusError {
  status?: number;
  statusCode?: number;
  message?: string;
}

const statusOf = (e: unknown): number | null => {
  if (!e || typeof e !== "object") return null;
  const m = e as MaybeStatusError;
  if (typeof m.status === "number") return m.status;
  if (typeof m.statusCode === "number") return m.statusCode;
  return null;
};

const messageOf = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "unknown error";
};

/** Map an upstream / unexpected error to a CORS-headed JSON Response with
 *  the right HTTP status. */
export function aiErrorResponse(e: unknown, fnName?: string): Response {
  const status = statusOf(e);
  const tag = fnName ? `[${fnName}] ` : "";
  // Log error class + status only — never the payload body.
  console.error(
    `${tag}AI call failed (status=${status ?? "n/a"}): ${messageOf(e)}`,
  );

  if (status === 401) {
    return json(502, {
      error: "AI auth failed (server-side configuration issue)",
    });
  }

  if (status === 429) {
    return json(429, { error: "Rate limit exceeded. Try again shortly." });
  }

  if (status === 529) {
    return json(529, {
      error: "AI is overloaded right now. Try again shortly.",
    });
  }

  if (status === 400) {
    return json(400, { error: messageOf(e) });
  }

  return json(500, { error: "AI request failed" });
}
