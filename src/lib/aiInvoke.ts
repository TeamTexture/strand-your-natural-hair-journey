// Shared entry point for AI edge-function calls.
//
// Why this exists: several AI surfaces are triggered from effects whose deps
// change identity (an object from a query hook, a context payload), and a few
// are rendered by two components at once. That produced pairs of IDENTICAL
// gateway generations seconds apart — double the wait for the user and double
// the cost. Every call made through `aiInvoke` shares one in-flight promise
// per (function, body) pair, so a duplicate trigger joins the request already
// running instead of starting a second one.
//
// This is deduplication only — it does not cache results. Each function keeps
// its own server-side `ai_summaries` cache for that.

import { supabase } from "@/integrations/supabase/client";

type Body = Record<string, unknown> | undefined;

const inflight = new Map<string, Promise<unknown>>();

const keyFor = (fn: string, body: Body) => {
  let payload = "";
  try {
    payload = JSON.stringify(body ?? {});
  } catch {
    payload = String(Date.now()); // unserialisable body — never dedupe it
  }
  return `${fn}::${payload}`;
};

/** Invoke an AI edge function, sharing any identical call already in flight. */
export async function aiInvoke<T = unknown>(
  fn: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: unknown }> {
  const key = keyFor(fn, body);
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<{ data: T | null; error: unknown }>;
  }
  const run = supabase.functions
    .invoke(fn, { body })
    .then((res) => ({ data: (res.data ?? null) as T | null, error: res.error }))
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, run);
  return run as Promise<{ data: T | null; error: unknown }>;
}
