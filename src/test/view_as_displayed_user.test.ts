// Regression: while admin impersonation ("View as member") is active, member
// data must be resolved for the IMPERSONATED member — never for the signed-in
// admin session. Repro of the reported bug: Jem's Home CURRENT STYLE card
// showed the admin's own journal style ("Afro Mohawk") because the loader
// resolved the id via `supabase.auth.getUser()` and fell back to the admin's
// `strand_*` localStorage snapshot.

import { describe, it, expect, vi, beforeEach } from "vitest";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "22222222-2222-2222-2222-222222222222";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: ADMIN_ID } } })) },
  },
}));

import {
  getDisplayedUserId,
  getSignedInUserId,
  getDisplayedAuthUser,
  isViewingAsUser,
  VIEW_AS_USER_ID_KEY,
} from "@/lib/displayedUser";
import { strandCacheBelongsTo, STRAND_OWNER_KEY } from "@/lib/strandLocalStorage";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("displayed user resolution", () => {
  it("returns the signed-in id when not impersonating", async () => {
    expect(isViewingAsUser()).toBe(false);
    expect(await getDisplayedUserId()).toBe(ADMIN_ID);
    expect((await getDisplayedAuthUser()).data.user?.id).toBe(ADMIN_ID);
  });

  it("returns the impersonated member's id — not the session id", async () => {
    sessionStorage.setItem(VIEW_AS_USER_ID_KEY, MEMBER_ID);
    expect(isViewingAsUser()).toBe(true);
    expect(await getDisplayedUserId()).toBe(MEMBER_ID);
    expect((await getDisplayedAuthUser()).data.user?.id).toBe(MEMBER_ID);
    // The real session identity stays available for role/billing checks.
    expect(await getSignedInUserId()).toBe(ADMIN_ID);
  });
});

describe("cached strand_* values are owner-scoped", () => {
  it("refuses the admin's cache while impersonating", () => {
    localStorage.setItem(STRAND_OWNER_KEY, ADMIN_ID);
    sessionStorage.setItem(VIEW_AS_USER_ID_KEY, MEMBER_ID);
    expect(strandCacheBelongsTo(MEMBER_ID)).toBe(false);
  });

  it("allows the cache for its own owner", () => {
    localStorage.setItem(STRAND_OWNER_KEY, ADMIN_ID);
    expect(strandCacheBelongsTo(ADMIN_ID)).toBe(true);
  });

  it("refuses a cache owned by a different member", () => {
    localStorage.setItem(STRAND_OWNER_KEY, ADMIN_ID);
    expect(strandCacheBelongsTo(MEMBER_ID)).toBe(false);
  });
});
