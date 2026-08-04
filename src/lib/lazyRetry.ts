import { lazy, type ComponentType } from "react";

/**
 * Route-level lazy import that survives a stale deploy.
 *
 * After a new build ships, an open tab still holds the OLD chunk filenames.
 * Navigating then throws "Failed to fetch dynamically imported module" and the
 * Suspense boundary unmounts to a blank screen. We retry once (transient CDN
 * blip), then force a single hard reload so the tab picks up the new manifest.
 */
const RELOAD_KEY = "strand_chunk_reloaded_at";

export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // One quiet retry — covers a genuine network hiccup.
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch {
        // Still failing: the chunk is gone. Reload once, guarded so we can
        // never loop if the reload doesn't help.
        try {
          const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
          if (Date.now() - last > 15000) {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            window.location.reload();
            // Hang until the reload takes over so no error surfaces.
            await new Promise(() => {});
          }
        } catch {
          // sessionStorage unavailable (private mode) — fall through.
        }
        throw err;
      }
    }
  });
}
