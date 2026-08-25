import { supabase } from "@/integrations/supabase/client";

/**
 * Database-backed store for onboarding drafts.
 *
 * Onboarding drafts used to live in localStorage only. That survives a refresh
 * but not the two things members actually do: switching from phone to laptop,
 * and walking away for days/weeks to get their blood test done. The durable
 * copy therefore lives in `public.onboarding_drafts` (one row per member per
 * draft key); localStorage stays in front of it as a fast, synchronous cache so
 * screens still hydrate instantly with no network wait.
 *
 * Conflict rule: whichever copy was written last wins. The local write time is
 * kept alongside the cached payload so a stale device can't overwrite newer
 * answers saved elsewhere.
 */
export type DraftPayload = Record<string, unknown>;

const TS_PREFIX = "strand_draft_ts_";

export const draftTimestampKey = (key: string) => `${TS_PREFIX}${key}`;

export function readLocalDraftTime(key: string): number {
  try {
    const raw = localStorage.getItem(draftTimestampKey(key));
    const n = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLocalDraftTime(key: string, iso = new Date().toISOString()): void {
  try {
    localStorage.setItem(draftTimestampKey(key), iso);
  } catch {
    /* quota / private mode */
  }
}

export function clearLocalDraftTimes(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getDisplayedAuthUser();
  return data?.user?.id ?? null;
}

export interface RemoteDraft {
  payload: DraftPayload;
  updatedAt: number;
}

/** Read the durable copy of one draft. Returns null when there isn't one. */
export async function loadRemoteDraft(key: string): Promise<RemoteDraft | null> {
  try {
    const userId = await currentUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from("onboarding_drafts")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .eq("draft_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { payload: unknown; updated_at: string };
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
    const at = Date.parse(row.updated_at);
    return { payload: row.payload as DraftPayload, updatedAt: Number.isFinite(at) ? at : 0 };
  } catch (err) {
    // A draft read must never break a capture screen — the local cache still
    // renders and the member simply keeps whatever this device already had.
    console.warn("[onboarding draft] remote read failed", key, err);
    return null;
  }
}

/** Write the durable copy immediately (no debounce). */
export async function flushRemoteDraft(key: string, payload: DraftPayload): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const { error } = await supabase
      .from("onboarding_drafts")
      .upsert(
        {
          user_id: userId,
          draft_key: key,
          payload: payload as never,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,draft_key" },
      );
    if (error) throw error;
  } catch (err) {
    console.warn("[onboarding draft] remote save failed", key, err);
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, DraftPayload>();

/**
 * Queue a durable save. Typing fires this on every keystroke, so writes are
 * coalesced per draft key and also flushed when the tab is hidden or closed —
 * a member who backgrounds the app mid-answer keeps that answer.
 */
export function saveRemoteDraft(key: string, payload: DraftPayload, delay = 900): void {
  pending.set(key, payload);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const next = pending.get(key);
      pending.delete(key);
      if (next) void flushRemoteDraft(key, next);
    }, delay),
  );
}

export function flushAllPendingDrafts(): void {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  pending.forEach((payload, key) => void flushRemoteDraft(key, payload));
  pending.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAllPendingDrafts);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAllPendingDrafts();
  });
}

/** Remove the durable copy — used when a flow is finished or restarted. */
export async function deleteRemoteDraft(key: string): Promise<void> {
  timers.forEach((t, k) => {
    if (k === key) clearTimeout(t);
  });
  timers.delete(key);
  pending.delete(key);
  try {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase.from("onboarding_drafts").delete().eq("user_id", userId).eq("draft_key", key);
  } catch (err) {
    console.warn("[onboarding draft] remote delete failed", key, err);
  }
}

/** Remove every durable draft for the signed-in member (onboarding finished). */
export async function deleteAllRemoteDrafts(): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase.from("onboarding_drafts").delete().eq("user_id", userId);
  } catch (err) {
    console.warn("[onboarding draft] remote wipe failed", err);
  }
}
