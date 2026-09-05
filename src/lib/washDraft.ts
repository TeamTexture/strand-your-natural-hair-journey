// Durable store for the in-progress WASH DAY log.
//
// The four wash-day capture screens (steps → results → reflection → styling →
// review) used to hand the entry between each other through localStorage
// alone. That loses the WHOLE log, silently, whenever the browser clears
// storage, the member switches from phone to laptop mid-flow, or a private
// window is closed — she only finds out when the review screen shows "No steps
// logged yet".
//
// Each screen's slice is now mirrored into `public.onboarding_drafts` (the same
// per-member durable draft table the onboarding flow uses) under a `wash_*`
// draft key. localStorage stays in front as a synchronous cache so nothing
// waits on the network; the durable copy is only consulted when the local one
// is missing or older.
//
// Conflict rule matches onboarding drafts: last write wins, compared on the
// stored write timestamps.
import {
  loadRemoteDraft,
  saveRemoteDraft,
  deleteRemoteDraft,
  readLocalDraftTime,
  writeLocalDraftTime,
} from "@/lib/onboardingDraftStore";

/** The localStorage keys that together make up one unsaved wash day. */
export const WASH_LOCAL_KEYS = [
  "strand_wash_step1_draft",
  "strand_wash_step1",
  "strand_wash_step2",
  "strand_wash_step3",
  "strand_wash_styling",
  "strand_wash_log_steps",
  "strand_wash_log_style",
  "strand_wash_date",
] as const;

export type WashLocalKey = (typeof WASH_LOCAL_KEYS)[number];

/** Keys whose stored value is a bare string rather than a JSON object. */
const SCALAR_KEYS: readonly WashLocalKey[] = ["strand_wash_date"];

const remoteKey = (key: WashLocalKey) => `wash:${key.replace(/^strand_wash_/, "")}`;

const setLocal = (key: string, raw: string) => {
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* quota / private mode — the durable copy still holds the answer */
  }
};

const getLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Read one slice of the draft from the fast local cache. */
export function readWashDraft<T>(key: WashLocalKey, fallback: T): T {
  const raw = getLocal(key);
  if (raw === null) return fallback;
  if (SCALAR_KEYS.includes(key)) return raw as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write one slice locally AND durably. */
export function writeWashDraft(key: WashLocalKey, value: unknown): void {
  const scalar = SCALAR_KEYS.includes(key);
  const raw = scalar ? String(value ?? "") : JSON.stringify(value ?? {});
  setLocal(key, raw);
  writeLocalDraftTime(remoteKey(key));
  saveRemoteDraft(remoteKey(key), scalar ? { value: raw } : (value as Record<string, unknown>) ?? {});
}

/** Drop one slice from both copies. */
export function clearWashDraft(key: WashLocalKey): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  void deleteRemoteDraft(remoteKey(key));
}

/** Drop the entire unsaved wash day (called once it has been saved). */
export function clearWashDrafts(): void {
  WASH_LOCAL_KEYS.forEach(clearWashDraft);
}

const isEmptyPayload = (value: unknown) =>
  !value || typeof value !== "object" || Object.keys(value as object).length === 0;

/**
 * Pull the durable copy of every slice into localStorage when this device is
 * missing it or holds an older version. Returns the keys that were restored
 * from the server so a screen can tell the member her log was recovered.
 */
export async function hydrateWashDrafts(): Promise<WashLocalKey[]> {
  const restored: WashLocalKey[] = [];
  await Promise.all(
    WASH_LOCAL_KEYS.map(async (key) => {
      const rk = remoteKey(key);
      const remote = await loadRemoteDraft(rk);
      if (!remote || isEmptyPayload(remote.payload)) return;
      const localRaw = getLocal(key);
      const localTime = readLocalDraftTime(rk);
      // Local wins only when it exists AND is at least as recent.
      if (localRaw !== null && localTime >= remote.updatedAt) return;
      if (SCALAR_KEYS.includes(key)) {
        const value = (remote.payload as { value?: unknown }).value;
        if (typeof value !== "string" || !value) return;
        setLocal(key, value);
      } else {
        setLocal(key, JSON.stringify(remote.payload));
      }
      writeLocalDraftTime(rk, new Date(remote.updatedAt).toISOString());
      if (localRaw === null) restored.push(key);
    }),
  );
  return restored;
}
