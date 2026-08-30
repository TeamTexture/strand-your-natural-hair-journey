// INTERNAL TRIGGER AUTH (2026-08-30 security fix)
// ===============================================
// `notify-admin-message` and `notify-message-recipient` are invoked by database
// triggers over pg_net, so they cannot carry a member JWT and are deployed with
// verify_jwt = false. Before this module they were reachable by ANYONE holding a
// message UUID, who could re-trigger an email send.
//
// They now require a shared internal secret, sent by the trigger as
// `x-strand-notify-secret` and held in `NOTIFY_TRIGGER_SECRET`. The secret lives
// in the function environment and in a private table the trigger reads — never
// in the repo. A caller without it gets 401. A missing configuration fails
// LOUDLY (503) rather than silently accepting anonymous callers.

declare const Deno: { env: { get(key: string): string | undefined } };

const HEADER = "x-strand-notify-secret";

/** Constant-time-ish comparison (lengths differ -> immediate false). */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface TriggerAuthFailure {
  status: number;
  body: { ok: false; reason: string };
}

/**
 * Returns null when the caller is the trusted database trigger (or a
 * service-role caller), otherwise the response to return immediately.
 */
export function authoriseTriggerCall(req: Request): TriggerAuthFailure | null {
  const expected = (Deno.env.get("NOTIFY_TRIGGER_SECRET") ?? "").trim();
  if (!expected) {
    console.error(
      "trigger-auth: NOTIFY_TRIGGER_SECRET is not configured — refusing every call",
    );
    return { status: 503, body: { ok: false, reason: "notify_secret_not_configured" } };
  }

  const presented = (req.headers.get(HEADER) ?? "").trim();
  if (presented && sameSecret(presented, expected)) return null;

  // Service-role callers (server-side backfills, admin tooling) stay allowed.
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && bearer && sameSecret(bearer, serviceKey)) return null;

  console.warn("trigger-auth: rejected unauthenticated notification call");
  return { status: 401, body: { ok: false, reason: "unauthorised" } };
}
