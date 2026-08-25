import { supabase } from "@/integrations/supabase/client";

const HOUR_MS = 60 * 60 * 1000;
const AUTH_LOCK_SETTLE_MS = 2500;
const storageKey = (userId: string) => `strand_last_session_log_${userId}`;

// Track per-userId within this tab as an extra guard against duplicate fires
// during rapid auth-state changes.
const inFlight = new Set<string>();

export function logUserSession(userId: string, source?: string): void {
  if (!userId || inFlight.has(userId)) return;

  // Local debounce: at most one attempt per user per hour from this browser.
  try {
    const last = localStorage.getItem(storageKey(userId));
    if (last && Date.now() - Number(last) < HOUR_MS) return;
  } catch {
    // ignore storage errors
  }

  inFlight.add(userId);
  // Optimistically stamp local guard so failures don't cause a retry storm.
  try {
    localStorage.setItem(storageKey(userId), String(Date.now()));
  } catch {
    // ignore
  }

  // Fire-and-forget, but NEVER start the database request synchronously from an
  // auth-state callback. The auth client holds its browser lock while emitting
  // those events; a database request started inside the same stack queues behind
  // that lock and can leave every signed-in read stuck on the Loading screen.
  const send = () => {
    void Promise.resolve(
      supabase.from("user_sessions").insert({ user_id: userId, source: source ?? null })
    ).then(
      () => {
        inFlight.delete(userId);
      },
      () => {
        inFlight.delete(userId);
      }
    );
  };
  if (typeof window === "undefined") send();
  else window.setTimeout(send, AUTH_LOCK_SETTLE_MS);
}
