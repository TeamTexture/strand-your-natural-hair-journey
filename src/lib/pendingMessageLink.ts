/**
 * Pending "open this admin message" intent.
 *
 * Set when someone taps the link in a STRAND ADMIN broadcast email but cannot
 * be taken to the thread yet (not signed in, no trial started, onboarding
 * unfinished). Consumed by `/open` on a later visit and by the end of the
 * first-run tour, so a member who has just finished onboarding lands in the
 * chat where the message is waiting instead of on Home.
 *
 * The key deliberately does NOT use the `strand_` / `strand.` namespace: those
 * keys are purged on sign-out, and this intent has to survive the
 * register → sign-in hop that the email link can trigger.
 */
const KEY = "strandPendingAdminThread";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  threadId: string;
  ts: number;
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function setPendingMessageThread(threadId: string | null | undefined): void {
  if (!threadId || !isUuid(threadId)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ threadId, ts: Date.now() } satisfies Stored));
  } catch {
    /* private mode / quota — the in-flight navigation still works */
  }
}

/** Read without clearing. Returns null when absent, malformed or expired. */
export function peekPendingMessageThread(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed?.threadId !== "string" || !isUuid(parsed.threadId)) {
      clearPendingMessageThread();
      return null;
    }
    if (typeof parsed.ts !== "number" || now - parsed.ts > MAX_AGE_MS) {
      clearPendingMessageThread();
      return null;
    }
    return parsed.threadId;
  } catch {
    return null;
  }
}

/** Read and remove in one step. */
export function consumePendingMessageThread(now = Date.now()): string | null {
  const id = peekPendingMessageThread(now);
  clearPendingMessageThread();
  return id;
}

export function clearPendingMessageThread(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Test seam: the storage key and window, so the test can assert the contract. */
export const PENDING_MESSAGE_KEY = KEY;
export const PENDING_MESSAGE_MAX_AGE_MS = MAX_AGE_MS;
