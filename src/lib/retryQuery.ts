/**
 * Supabase's auth client serialises token refreshes behind a browser lock.
 * When many queries fire at once (the Home screen loads a dozen), one request
 * can "steal" that lock and the rest abort with
 * `AbortError: Lock broken by another request with the 'steal' option`.
 * Those sections then render empty even though the data exists.
 *
 * These helpers detect that transient failure and retry with a short backoff.
 */

/** True when an error is the transient auth-lock/abort failure, not a real error. */
export function isTransientAuthLockError(err: unknown): boolean {
  const message =
    typeof err === "string"
      ? err
      : ((err as { message?: string } | null)?.message ?? "");
  return (
    message.includes("Lock broken by another request") ||
    message.includes("AbortError") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError")
  );
}

/**
 * Runs a Supabase query builder, retrying transient auth-lock aborts.
 * Works with any thenable returning `{ data, error }`.
 */
export async function withAuthLockRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  attempts = 3,
): Promise<T> {
  let result = await run();
  for (let i = 1; i < attempts; i++) {
    if (!result.error || !isTransientAuthLockError(result.error)) return result;
    await new Promise((r) => setTimeout(r, 150 * i));
    result = await run();
  }
  return result;
}
