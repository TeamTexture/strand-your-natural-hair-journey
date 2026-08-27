import { useEffect, useState } from "react";
import { hydrateWashDrafts, type WashLocalKey } from "@/lib/washDraft";

/**
 * Pull the durable copy of an unsaved wash day onto this device before a
 * capture screen reads it. Screens should hold their content back until
 * `ready` so they never render (or save) a log that only looks empty because
 * the server copy hadn't arrived yet.
 */
export function useWashDraftHydration() {
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState<WashLocalKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys = await hydrateWashDrafts();
      if (cancelled) return;
      setRestored(keys);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, restored, recovered: restored.length > 0 };
}
