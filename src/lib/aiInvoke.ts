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
import { getSignedInUserId, getViewAsUserId } from "@/lib/displayedUser";

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

async function bodyForInvoke(body: Record<string, unknown> | undefined): Promise<Record<string, unknown> | undefined> {
  const impersonatedUserId = getViewAsUserId();
  if (!impersonatedUserId) return body;
  const impersonatedBy = await getSignedInUserId();
  return {
    ...(body ?? {}),
    dryRun: true,
    impersonatedUserId,
    impersonation: {
      active: true,
      targetUserId: impersonatedUserId,
      impersonatedBy,
    },
  };
}

/** True when an edge function rejected the call for auth reasons. */
export function isAuthInvokeError(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? "";
  return /401|unauthorized|missing auth|non-2xx/i.test(msg);
}

/**
 * Make sure the access token in localStorage is still usable before we spend a
 * round trip on an AI call. A token that is expired (or about to be) makes the
 * edge function's `getUser()` fail with 401, which used to surface as
 * "Edge Function returned a non-2xx status code" and then bounce the member to
 * the sign-in screen mid-session.
 */
async function ensureFreshSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt && expiresAt - Date.now() > 120_000) return true;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return !!refreshed.session;
}

/** Invoke an AI edge function, sharing any identical call already in flight. */
export async function aiInvoke<T = unknown>(
  fn: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: unknown }> {
  const invokeBody = await bodyForInvoke(body);
  const key = keyFor(fn, invokeBody);
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<{ data: T | null; error: unknown }>;
  }
  const run = (async () => {
    await ensureFreshSession();
    let res = await supabase.functions.invoke(fn, { body: invokeBody });
    if (res.error && isAuthInvokeError(res.error)) {
      // One refresh-and-retry. A genuinely dead session returns the error so
      // the caller can say so plainly; we never sign the member out here.
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) {
        res = await supabase.functions.invoke(fn, { body: invokeBody });
      }
    }
    return { data: (res.data ?? null) as T | null, error: res.error };
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run as Promise<{ data: T | null; error: unknown }>;
}

