// Citation sanitiser + audit-log wrapper.
//
// Every AI edge function calls `sanitiseAndLog(value, functionName)` on its
// response instead of `sanitiseChapterCitationsDeep` directly. This runs the
// same strip logic, then — if any content was removed — inserts a row into
// `public.ai_citation_violations` so Paige can monitor whether the model is
// still attempting to fabricate citations after the 2026-04-27 citation ban.
//
// The DB write is best-effort. If service-role env is missing or the insert
// fails, we swallow the error and still return the sanitised value: the
// user must never see raw citations because logging broke.

import { sanitiseChapterCitationsDeep, sanitiseChapterCitations } from "./book-chapters.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

/** Walk both trees in lockstep and collect the substrings that were removed
 *  from string leaves. We only care about a coarse "did anything change and
 *  what did the model say" signal — full diff granularity is not needed. */
function collectStripped(original: unknown, cleaned: unknown, out: string[]): void {
  if (original == null) return;
  if (typeof original === "string") {
    if (typeof cleaned === "string" && cleaned !== original) {
      // Log the whole original leaf when a strip occurred — keeps the audit
      // useful (the "Read more —" line stays visible in the log).
      out.push(original);
    }
    return;
  }
  if (Array.isArray(original)) {
    const cleanedArr = Array.isArray(cleaned) ? cleaned : [];
    for (let i = 0; i < original.length; i++) {
      collectStripped(original[i], cleanedArr[i], out);
    }
    return;
  }
  if (typeof original === "object") {
    const cleanedObj = (cleaned && typeof cleaned === "object" ? cleaned : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(original as Record<string, unknown>)) {
      collectStripped(v, cleanedObj[k], out);
    }
  }
}

async function logViolation(
  functionName: string,
  strippedLeaves: string[],
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return;

    const stripped_text = strippedLeaves.join("\n\n---\n\n").slice(0, 8000);
    const original_length = strippedLeaves.reduce((a, s) => a + s.length, 0);
    const cleaned_length = strippedLeaves.reduce(
      (a, s) => a + sanitiseChapterCitations(s).length,
      0,
    );

    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_citation_violations").insert({
      function_name: functionName,
      stripped_text,
      original_length,
      cleaned_length,
    });
  } catch (e) {
    console.warn(`[citation-log] failed to log violation for ${functionName}:`, e);
  }
}

/** Sanitise the AI response deeply, and if anything was stripped, insert an
 *  audit row into `ai_citation_violations`. Always returns the cleaned value.
 *
 *  Await this if you can — the log write is fire-and-forget compatible but
 *  awaiting keeps stack traces readable when the DB is down. */
export async function sanitiseAndLog<T>(value: T, functionName: string): Promise<T> {
  const cleaned = sanitiseChapterCitationsDeep(value);
  const stripped: string[] = [];
  collectStripped(value, cleaned, stripped);
  if (stripped.length > 0) {
    await logViolation(functionName, stripped);
  }
  return cleaned;
}
