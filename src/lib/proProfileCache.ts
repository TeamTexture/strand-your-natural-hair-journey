import type { QueryClient } from "@tanstack/react-query";

/**
 * ONE cache identity for a professional's listing row.
 *
 * `pro_profiles` is the single source of truth for both the pro's own dashboard
 * and the member-facing directory. It used to be read under two different query
 * keys ("pro_profile" in the edit screen, "pro_profile_review" everywhere else),
 * so saving an edit refreshed only one of them: the directory showed the new
 * details while the professional's own dashboard kept serving the pre-edit row —
 * and a later save from a stale form could write the old values back.
 *
 * Every read of the row now uses PRO_PROFILE_KEY, and every write calls
 * refreshProProfile so the dashboard, the directory and the greeting all repaint
 * from the row that was just saved.
 */
export const PRO_PROFILE_KEY = (userId?: string | null) =>
  ["pro_profile", userId ?? null] as const;

/** Invalidate + refetch every surface that renders a pro listing. */
export async function refreshProProfile(qc: QueryClient, userId?: string | null) {
  await Promise.all([
    // Shared row (dashboard, gates, setup, edit screen).
    qc.invalidateQueries({ queryKey: ["pro_profile"] }),
    // Legacy key kept for any consumer still mounted under it.
    qc.invalidateQueries({ queryKey: ["pro_profile_review"] }),
    // Member-facing directory + salon roster + greeting name.
    qc.invalidateQueries({ queryKey: ["pro_directory"] }),
    qc.invalidateQueries({ queryKey: ["directory"] }),
    qc.invalidateQueries({ queryKey: ["salon-stylists"] }),
    qc.invalidateQueries({ queryKey: ["pro_greeting_name", userId] }),
  ]);
  // Refetch the row itself before we navigate, so the next screen never paints
  // from a stale cache entry.
  await qc.refetchQueries({ queryKey: PRO_PROFILE_KEY(userId) });
}
