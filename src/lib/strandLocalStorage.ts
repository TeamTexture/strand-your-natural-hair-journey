// Helpers for the `strand_*` localStorage namespace.
//
// All clinical and onboarding data the app caches under localStorage uses the
// `strand_` prefix. When a user signs out we MUST purge those keys so that the
// next user signing in on the same browser doesn't inherit a previous user's
// blood results, hair profile, etc. (see hotfix on top of 1c97c85.)
//
// Two keys are explicitly preserved across sign-out because they are
// device-level state, not user-specific clinical data:
//   - `strand_walkthrough_complete`: UI state — whether the marketing
//     walkthrough has been seen on this device.
//   - `strand_migration_v1_done`: migration history for the legacy
//     localStorage → Postgres migration. Re-running it on every sign-in would
//     be wasteful and noisy in the logs.
//
export const STRAND_PREFIX = "strand_";

export const STRAND_PRESERVED_KEYS: ReadonlySet<string> = new Set([
  "strand_walkthrough_complete",
  "strand_migration_v1_done",
  "strand_last_display_name",
]);

/** Remove every `strand_*` key from localStorage except the device-level UI
 *  state and migration-history flags. Safe to call in SSR / non-browser
 *  contexts (no-op). */
export function purgeStrandUserScopedKeys(source = "unknown"): void {
  console.log("[strand] purge called from", source);
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(STRAND_PREFIX)) continue;
      if (STRAND_PRESERVED_KEYS.has(key)) continue;
      toRemove.push(key);
    }
    for (const key of toRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore quota / private-mode errors */
      }
    }
  } catch {
    /* ignore — private-mode browsers can throw on .key() iteration */
  }
}
