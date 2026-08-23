import { useEffect } from "react";
import { hydrateBloodDraft, setBloodDraftStep } from "@/hooks/useBloodValues";

/**
 * Makes one blood-entry screen resumable.
 *
 * On mount it pulls the durable copy of the blood draft onto this device (so a
 * member who started on their phone sees the same part-filled panel on a
 * laptop weeks later), then records this screen as the place to come back to.
 */
export function useBloodDraftResume(path: string) {
  useEffect(() => {
    let cancelled = false;
    void hydrateBloodDraft().finally(() => {
      if (!cancelled) setBloodDraftStep(path);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
}

export default useBloodDraftResume;
