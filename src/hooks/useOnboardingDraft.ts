import { useEffect, useRef, useState } from "react";
import {
  clearLocalDraftTimes,
  deleteAllRemoteDrafts,
  loadRemoteDraft,
  readLocalDraftTime,
  saveRemoteDraft,
  writeLocalDraftTime,
  type DraftPayload,
} from "@/lib/onboardingDraftStore";

/**
 * Keeps a single onboarding step's form state alive across navigation,
 * sessions AND devices.
 *
 * Onboarding steps only wrote to Postgres on "Continue", so a member who
 * filled a step and tapped back lost everything they had typed. This hook
 * mirrors the live form state into localStorage (`strand_draft_*`, so it is
 * purged on sign-out with the rest of the user-scoped keys) for instant
 * hydration, and into `public.onboarding_drafts` so the same part-finished
 * answers come back on another device or weeks later.
 *
 * Usage:
 *   useOnboardingDraft("pro-details", { name, type, notes }, (d) => {
 *     if (d.name !== undefined) setName(d.name);
 *   });
 */
const PREFIX = "strand_draft_";

export const onboardingDraftKey = (key: string) => `${PREFIX}${key}`;

export function useOnboardingDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  restore: (draft: Partial<T>) => void,
) {
  const [hydrated, setHydrated] = useState(false);
  // Saving to Postgres must wait until the remote read has settled. Writing the
  // empty initial form state straight away overwrote the member's saved answers
  // on the server before they could be restored, so a returning member found a
  // blank step every time and could never get past it.
  const [remoteSettled, setRemoteSettled] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    let cancelled = false;
    let localTime = 0;
    setRemoteSettled(false);

    // 1. Local cache first, synchronously, so the step never renders empty
    //    while a network read is in flight.
    try {
      const raw = localStorage.getItem(onboardingDraftKey(key));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          restoreRef.current(parsed as Partial<T>);
          localTime = readLocalDraftTime(key);
        }
      }
    } catch {
      /* ignore corrupt drafts */
    }
    setHydrated(true);

    // 2. Then the durable copy. It only wins when this device has nothing
    //    cached or was written earlier than the saved answers elsewhere.
    void loadRemoteDraft(key)
      .then((remote) => {
        if (cancelled || !remote) return;
        if (localTime && remote.updatedAt <= localTime) return;
        restoreRef.current(remote.payload as Partial<T>);
        try {
          localStorage.setItem(onboardingDraftKey(key), JSON.stringify(remote.payload));
        } catch {
          /* quota / private mode */
        }
        writeLocalDraftTime(key, new Date(remote.updatedAt || Date.now()).toISOString());
      })
      .finally(() => {
        if (!cancelled) setRemoteSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(onboardingDraftKey(key), JSON.stringify(values));
      writeLocalDraftTime(key);
    } catch {
      /* quota / private mode */
    }
    // Every answered field persists on its own — no explicit "save" action.
    if (remoteSettled) saveRemoteDraft(key, values as DraftPayload);
  }, [hydrated, remoteSettled, key, values]);

}

/** Called once onboarding is finished so drafts don't linger. */
export function clearOnboardingDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  clearLocalDraftTimes();
  void deleteAllRemoteDrafts();
}
