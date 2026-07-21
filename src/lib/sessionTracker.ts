import { supabase } from "@/integrations/supabase/client";

const HOUR_MS = 60 * 60 * 1000;
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

  // Fire-and-forget. Server-side trigger enforces the 1-hour dedupe too.
  void supabase
    .from("user_sessions")
    .insert({ user_id: userId, source: source ?? null })
    .then(() => {
      inFlight.delete(userId);
    });
}
