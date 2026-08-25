import { useCallback, useEffect, useState } from "react";
import {
  flushRemoteDraft,
  loadRemoteDraft,
  readLocalDraftTime,
  writeLocalDraftTime,
} from "@/lib/onboardingDraftStore";
import { onboardingDraftKey } from "@/hooks/useOnboardingDraft";

/**
 * "I'll decide later" for blood work.
 *
 * Blood work is optional, so a member must be able to put it down without the
 * card following her around. That decision is hers, not derivable from any row
 * we already hold: "no bloods on file" and "no bloods on file AND I have chosen
 * to leave it for now" are different states, and only the second one should
 * grey the card out. Everything else on this screen IS derived (see
 * getOnboardingRequirements) — this is the one piece that isn't.
 *
 * So it is stored as one row in the existing `public.onboarding_drafts` table
 * under the draft key below — no new column, no schema change, and it travels
 * across devices with the rest of her saved progress. localStorage is only the
 * synchronous cache in front of it (same pattern as every other draft), so a
 * member picking up a different phone still sees the skipped state.
 *
 * Reversible by design: adding results, or tapping "Add blood results" on the
 * greyed card, clears it.
 */
const DRAFT_KEY = "blood-skip";

const cacheKey = () => onboardingDraftKey(DRAFT_KEY);

function readCache(): boolean | null {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.skipped === "boolean" ? parsed.skipped : null;
  } catch {
    return null;
  }
}

function writeCache(skipped: boolean): void {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ skipped }));
    writeLocalDraftTime(DRAFT_KEY);
  } catch {
    /* quota / private mode */
  }
}

/** Persist the decision immediately (no debounce — she may sign out next). */
export async function setBloodSkipped(skipped: boolean): Promise<void> {
  writeCache(skipped);
  await flushRemoteDraft(DRAFT_KEY, { skipped });
}

/**
 * Reads the durable copy, preferring whichever was written last so a stale
 * device can't resurrect a card she already dismissed elsewhere.
 */
export function useBloodSkipped() {
  const [skipped, setSkipped] = useState<boolean>(() => readCache() ?? false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const localTime = readLocalDraftTime(DRAFT_KEY);
    void loadRemoteDraft(DRAFT_KEY).then((remote) => {
      if (cancelled) {
        return;
      }
      if (remote && (!localTime || remote.updatedAt > localTime)) {
        const value = (remote.payload as { skipped?: unknown }).skipped;
        if (typeof value === "boolean") {
          setSkipped(value);
          writeCache(value);
        }
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const skip = useCallback(async () => {
    setSkipped(true);
    await setBloodSkipped(true);
  }, []);

  const unskip = useCallback(async () => {
    setSkipped(false);
    await setBloodSkipped(false);
  }, []);

  return { skipped, loaded, skip, unskip };
}
