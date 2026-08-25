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

/** The app also uses a dotted namespace (`strand.tipsLevel`,
 *  `strand.stylePrompt.pending`, `strand.pendingStepProducts`, …). Those were
 *  previously NOT purged on sign-out, so a member's style/product/appointment
 *  state survived into the next person's session on a shared device. */
export const STRAND_PREFIXES: readonly string[] = ["strand_", "strand."];

export const STRAND_OWNER_KEY = "strand_device_owner_uid";

export const STRAND_PRESERVED_KEYS: ReadonlySet<string> = new Set([
  "strand_walkthrough_complete",
  "strand_migration_v1_done",
  // Accessibility preference for the device, holds no identity.
  "strand_font_scale",
  // Chunk-reload guard for lazy imports; infra state, holds no identity.
  "strand_chunk_reloaded_at",
]);

const isStrandKey = (key: string) => STRAND_PREFIXES.some((p) => key.startsWith(p));

const purgeStore = (store: Storage) => {
  const toRemove: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    if (!isStrandKey(key)) continue;
    if (STRAND_PRESERVED_KEYS.has(key)) continue;
    toRemove.push(key);
  }
  for (const key of toRemove) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }
};

/** Remove every `strand_*` / `strand.*` key from localStorage AND
 *  sessionStorage except the device-level UI state and migration-history
 *  flags. Safe to call in SSR / non-browser contexts (no-op). */
export function purgeStrandUserScopedKeys(source = "unknown"): void {
  console.log("[strand] purge called from", source);
  if (typeof window === "undefined") return;
  try {
    purgeStore(localStorage);
  } catch {
    /* ignore — private-mode browsers can throw on .key() iteration */
  }
  try {
    purgeStore(sessionStorage);
  } catch {
    /* ignore */
  }
}


// ─────────────────── Ownership guard for cached values ───────────────────
// A cached `strand_*` value belongs to whichever user was signed in when it
// was written (tracked in STRAND_OWNER_KEY). It must never be read as a
// fallback for a DIFFERENT displayed user — which is exactly what happens
// during admin "View as" mode, where the cache holds the ADMIN's clinical
// data while the screen is labelled as the member's.

/** The uid that owns the `strand_*` cache on this device, if known. */
export function strandCacheOwnerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STRAND_OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * True when the cached `strand_*` payload belongs to the member currently
 * being displayed. False while impersonating (cache is the admin's) or when
 * the owner uid doesn't match the displayed id.
 */
export function strandCacheBelongsTo(displayedUserId: string | null): boolean {
  if (typeof window === "undefined") return false;
  let viewAs: string | null = null;
  try {
    viewAs = sessionStorage.getItem("strand_view_as_user_id");
  } catch {
    viewAs = null;
  }
  if (viewAs) return false;
  const owner = strandCacheOwnerId();
  if (!owner) return true; // pre-sign-in onboarding writes: no other identity yet
  if (!displayedUserId) return true;
  return owner === displayedUserId;
}
