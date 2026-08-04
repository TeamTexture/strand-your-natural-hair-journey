/**
 * Password-recovery lock.
 *
 * A recovery link mints a real Supabase session BEFORE the new password is
 * chosen. Without a lock, anyone holding that link (or the user simply tapping
 * back) would land inside the app without ever proving a password. This flag
 * pins the browser to the reset screen until `updateUser({ password })`
 * succeeds — every protected route bounces back to the reset form while it is
 * set.
 *
 * sessionStorage is deliberate: it survives reloads and back navigation in the
 * tab that opened the link, and disappears when the tab closes.
 */

const KEY = "strand_password_recovery_pending";

export type RecoveryAudience = "member" | "pro" | "brand";

const path = (audience: RecoveryAudience) =>
  audience === "pro"
    ? "/pro/reset-password"
    : audience === "brand"
      ? "/brand/reset-password"
      : "/reset-password";

export const beginRecoveryLock = (audience: RecoveryAudience = "member") => {
  try {
    sessionStorage.setItem(KEY, audience);
  } catch {
    // Private browsing — nothing we can do, the reset screen still guards.
  }
};

export const getRecoveryLock = (): RecoveryAudience | null => {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "pro" || v === "member" || v === "brand" ? v : null;
  } catch {
    return null;
  }
};

export const isRecoveryLocked = () => getRecoveryLock() !== null;

/** Where a locked browser must be sent back to. */
export const recoveryLockPath = () => {
  const lock = getRecoveryLock();
  return lock ? path(lock) : null;
};

export const clearRecoveryLock = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // noop
  }
};
