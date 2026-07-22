// Directory anchor deep-link helper.
//
// Any place in the app that references a specific professional should route
// the user to the Professionals directory ANCHORED to that pro's card, rather
// than dropping them at the top of the list. This module is the single
// source of truth for how those links are formed.
//
// Usage:
//   nav(directoryLinkForPro(proUserId));
//   <Link to={directoryLinkForPro(proUserId)} />
//
// The Directory page (`src/pages/Directory.tsx`) reads the `pro` query param
// (or `self=1` for the owner's "view my listing" flow) and scrolls the
// matching card to the top of the viewport with a brief highlight pulse.
// If the target pro is unpublished / no longer listed, the directory shows
// a "This professional is no longer listed" toast and falls back to the top.

/**
 * Build a directory URL that anchors on the given pro's live listing.
 * Falls back to the plain directory when no user id is provided (so callers
 * can pipe optional values through safely).
 */
export function directoryLinkForPro(
  proUserId: string | null | undefined,
  opts: { bloodOnly?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (proUserId) params.set("pro", proUserId);
  if (opts.bloodOnly) params.set("bloodOnly", "1");
  const qs = params.toString();
  return qs ? `/directory?${qs}` : "/directory";
}

/** Link the current pro to their own listing (owner-styled card, star, Edit). */
export function directorySelfLink(): string {
  return "/directory?self=1";
}
