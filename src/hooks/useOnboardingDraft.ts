import { useEffect, useRef, useState } from "react";

/**
 * Keeps a single onboarding step's form state alive across navigation.
 *
 * Onboarding steps only wrote to Postgres on "Continue", so a member who
 * filled a step and tapped back lost everything they had typed. This hook
 * mirrors the live form state into localStorage (`strand_draft_*`, so it is
 * purged on sign-out with the rest of the user-scoped keys) and restores it
 * when the step is mounted again.
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
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(onboardingDraftKey(key));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") restoreRef.current(parsed as Partial<T>);
      }
    } catch {
      /* ignore corrupt drafts */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(onboardingDraftKey(key), JSON.stringify(values));
    } catch {
      /* quota / private mode */
    }
  }, [hydrated, key, values]);
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
}
