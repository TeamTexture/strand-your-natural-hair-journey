/**
 * Reading the REAL error out of `supabase.functions.invoke()`.
 *
 * The SDK throws / returns a `FunctionsHttpError` for ANY non-2xx response, and
 * its `message` is the fixed string "Edge Function returned a non-2xx status
 * code". The server's own JSON body — the sentence we actually wrote for the
 * member ("This offer has already been used on your membership.") — hangs off
 * `error.context`, which is a `Response` nobody ever reads. That is why members
 * saw the raw SDK string on the discount claim.
 *
 * This module is the single place that reads it. Rules:
 *  - prefer the server's `message`, then `error`, then `error_description`;
 *  - never surface an HTML error page, a stack trace, a Postgres string or the
 *    SDK's own generic sentence to a member;
 *  - always fall back to a written, human fallback the caller supplies.
 */

/** Fixed SDK sentences that must never reach a member. */
const SDK_NOISE =
  /non-2xx status code|FunctionsHttpError|FunctionsRelayError|FunctionsFetchError/i;

/** Postgres / infrastructure shapes that read as gibberish to a member. */
const TECHNICAL =
  /^(?:pgrst|22p02|23\d{3}|42\d{3})|violates row-level security|duplicate key value|permission denied for|relation ".+" does not exist/i;

const isMemberSafe = (s: string): boolean =>
  !!s &&
  s.length <= 300 &&
  !s.startsWith("<") &&
  !SDK_NOISE.test(s) &&
  !TECHNICAL.test(s) &&
  !/\n\s+at\s/.test(s);

function pickMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  for (const key of ["message", "error", "error_description", "msg"]) {
    const v = o[key];
    if (typeof v === "string" && isMemberSafe(v.trim())) return v.trim();
    // Nested { error: { message } }.
    if (v && typeof v === "object") {
      const nested = (v as Record<string, unknown>).message;
      if (typeof nested === "string" && isMemberSafe(nested.trim())) {
        return nested.trim();
      }
    }
  }
  return null;
}

/**
 * Read the server's message off a failed invoke. Returns null when there is
 * genuinely nothing member-safe to show (network failure, CORS, HTML page).
 */
export async function readInvokeErrorMessage(
  error: unknown,
): Promise<string | null> {
  if (!error) return null;

  const res = (error as { context?: unknown })?.context;
  // FunctionsHttpError carries the Response; a fetch/relay failure does not.
  if (res && typeof res === "object" && typeof (res as Response).text === "function") {
    const response = res as Response;
    // The body has not been read by the SDK, but be defensive: a clone can
    // throw if anything upstream consumed it, and then the direct read is the
    // only chance we get.
    const readers: Array<() => Promise<string>> = [
      async () => await response.clone().text(),
      async () => await response.text(),
    ];
    for (const read of readers) {
      try {
        const raw = (await read()).trim();
        if (!raw) continue;
        try {
          const fromJson = pickMessage(JSON.parse(raw));
          if (fromJson) return fromJson;
        } catch {
          // Plain-text body: usable only if it reads like a sentence.
          if (isMemberSafe(raw)) return raw;
        }
        break;
      } catch {
        /* try the next strategy */
      }
    }
  }

  // Some call sites already surface a plain Error thrown by our own code.
  const msg = (error as { message?: unknown })?.message;
  if (typeof msg === "string" && isMemberSafe(msg.trim())) return msg.trim();

  return null;
}

/**
 * The message to show a member for a failed invoke: the server's own sentence
 * when there is one, otherwise the written fallback. Never throws.
 */
export async function friendlyInvokeError(
  error: unknown,
  fallback: string,
): Promise<string> {
  try {
    return (await readInvokeErrorMessage(error)) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Synchronous variant for a value that has already been turned into an Error
 * (e.g. inside a react-query `onError`). Filters the SDK/technical strings so
 * a raw sentence can never leak into the UI.
 */
export function memberSafeMessage(error: unknown, fallback: string): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return isMemberSafe(msg.trim()) ? msg.trim() : fallback;
}
