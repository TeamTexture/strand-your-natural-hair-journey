// ─────────────────────────────────────────────────────────────────────────────
// ONE source of truth for "whose data am I showing?"
//
// The app has two identities at any moment:
//   • the SIGNED-IN user (the real JWT — always the admin during "View as")
//   • the DISPLAYED user (the impersonated member when view-as is active,
//     otherwise the signed-in user)
//
// Every read or write of member data must be scoped to the DISPLAYED user.
// `supabase.auth.getUser()` returns the SIGNED-IN user, so calling it directly
// in a member-data path leaks the admin's own rows into the member's view.
// Use `getDisplayedAuthUser()` / `getDisplayedUserId()` instead.
//
// React components should prefer `useAuth().user` / `useAuth().effectiveUserId`
// (already view-as aware); these helpers exist for the non-React paths
// (lib/*, PDF builders, query functions).
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** sessionStorage keys owned by the view-as feature (see useViewAs.tsx). */
export const VIEW_AS_USER_ID_KEY = "strand_view_as_user_id";
export const VIEW_AS_NAME_KEY = "strand_view_as_display_name";

/** The impersonated member's id, or null when not impersonating. */
export function getViewAsUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(VIEW_AS_USER_ID_KEY);
  } catch {
    return null;
  }
}

/** True while an admin is viewing the app as another member. */
export function isViewingAsUser(): boolean {
  return !!getViewAsUserId();
}

/** The real signed-in user id (the admin's own id during view-as). */
export async function getSignedInUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The id of the member whose data should be displayed. */
export async function getDisplayedUserId(): Promise<string | null> {
  const viewAs = getViewAsUserId();
  if (viewAs) return viewAs;
  return getSignedInUserId();
}

/**
 * Drop-in replacement for `supabase.auth.getUser()` in member-data paths.
 * Returns the same `{ data: { user } }` shape, but with `user.id` swapped to
 * the displayed member while impersonation is active.
 */
export async function getDisplayedAuthUser(): Promise<{ data: { user: User | null } }> {
  let signedIn: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = data.user ?? null;
  } catch {
    signedIn = null;
  }
  const viewAs = getViewAsUserId();
  if (!signedIn || !viewAs || viewAs === signedIn.id) return { data: { user: signedIn } };
  return { data: { user: { ...signedIn, id: viewAs } as User } };
}
