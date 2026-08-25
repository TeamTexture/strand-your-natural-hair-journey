/**
 * "Onboarding is finished" is a ONE-WAY, durable answer.
 *
 * `profiles.onboarding_completed_at` never un-sets itself, so once any read has
 * told us a member is through onboarding we remember it for the rest of the
 * session. Without this, a query cache eviction (or a slow read on a fresh
 * navigation) put the chrome back into the "unknown" state, and the gates that
 * treated unknown as incomplete flashed the resume / continue-onboarding bar at
 * members who had finished months ago.
 *
 * This memo NEVER decides that onboarding is incomplete — it only remembers a
 * positive answer. It changes no gating rule: what counts as complete still
 * comes from `getConsumerOnboardingStatus`.
 */

const KEY = (userId: string) => `strand.onboardingResolved.${userId}`;

const memo = new Set<string>();

/** Remember that this member's onboarding data requirements are complete. */
export function rememberOnboardingComplete(userId?: string | null) {
  if (!userId) return;
  memo.add(userId);
  try {
    sessionStorage.setItem(KEY(userId), "1");
  } catch {
    /* private mode / storage disabled — the in-memory memo still holds */
  }
}

/** Has a read this session already confirmed onboarding is complete? */
export function wasOnboardingComplete(userId?: string | null): boolean {
  if (!userId) return false;
  if (memo.has(userId)) return true;
  try {
    if (sessionStorage.getItem(KEY(userId)) === "1") {
      memo.add(userId);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Sign-out / account switch: drop the memo so nothing leaks across accounts. */
export function clearOnboardingResolved(userId?: string | null) {
  if (!userId) {
    memo.clear();
    return;
  }
  memo.delete(userId);
  try {
    sessionStorage.removeItem(KEY(userId));
  } catch {
    /* ignore */
  }
}
