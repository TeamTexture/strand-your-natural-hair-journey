import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * A member who has finished onboarding must NEVER see the resume /
 * continue-onboarding chrome, not even for a single frame. While the completion
 * status is unresolved the answer is "unknown", and unknown must render nothing
 * rather than the incomplete-state UI.
 */

const state = {
  status: undefined as undefined | { dataComplete: boolean; entryPath?: string },
  profile: undefined as undefined | { user_id: string; onboarding_completed_at: string | null },
  profilePending: true,
  hasAccess: false,
  subLoading: true,
  rolesLoading: true,
};

vi.mock("@/hooks/useOnboardingStatus", () => ({
  useOnboardingStatus: () => ({ data: state.status }),
}));
vi.mock("@/hooks/useMyProfile", () => ({
  useMyProfile: () => ({ data: state.profile, isPending: state.profilePending }),
}));
vi.mock("@/hooks/useConsumerSubscription", () => ({
  useConsumerSubscription: () => ({ hasAccess: state.hasAccess, isLoading: state.subLoading }),
}));
vi.mock("@/hooks/useRoles", () => ({
  useRoles: () => ({
    isAdmin: false,
    isProfessional: false,
    isBrand: false,
    loading: state.rolesLoading,
  }),
}));

const { useMemberAppUnlocked } = await import("@/hooks/useMemberAppUnlocked");
const { clearOnboardingResolved } = await import("@/lib/onboardingResolved");

beforeEach(() => {
  clearOnboardingResolved();
  sessionStorage.clear();
  state.status = undefined;
  state.profile = undefined;
  state.profilePending = true;
  state.hasAccess = false;
  state.subLoading = true;
  state.rolesLoading = true;
});

describe("member app lock is a three-state answer", () => {
  it("is UNKNOWN while the completion status is still loading, so no onboarding UI renders", () => {
    const { result } = renderHook(() => useMemberAppUnlocked());
    expect(result.current.unlocked).toBe(false);
    // known === false is the signal every gate uses to render NOTHING.
    expect(result.current.known).toBe(false);
  });

  it("is a resolved lock only once progress and entitlement have both answered", () => {
    state.profile = { user_id: "u1", onboarding_completed_at: null };
    state.profilePending = false;
    state.status = { dataComplete: false, entryPath: "/onboarding/profile-step-1" };
    state.subLoading = false;
    state.rolesLoading = false;
    const { result } = renderHook(() => useMemberAppUnlocked());
    expect(result.current.unlocked).toBe(false);
    expect(result.current.known).toBe(true);
  });

  it("unlocks a completed, paying member", () => {
    state.profile = { user_id: "u2", onboarding_completed_at: "2026-01-02T00:00:00Z" };
    state.profilePending = false;
    state.status = { dataComplete: true, entryPath: "/onboarding/resume" };
    state.subLoading = false;
    state.rolesLoading = false;
    state.hasAccess = true;
    const { result } = renderHook(() => useMemberAppUnlocked());
    expect(result.current).toMatchObject({ unlocked: true, known: true });
  });

  it("never reverts a resolved 'complete' to unknown when the status cache is evicted", () => {
    state.profile = { user_id: "u3", onboarding_completed_at: "2026-01-02T00:00:00Z" };
    state.profilePending = false;
    state.status = { dataComplete: true };
    state.subLoading = false;
    state.rolesLoading = false;
    state.hasAccess = true;
    renderHook(() => useMemberAppUnlocked());

    // Cache evicted on a later navigation: no status, profile read in flight.
    state.status = undefined;
    state.profilePending = true;
    const again = renderHook(() => useMemberAppUnlocked());
    // Still known — and never the locked/incomplete state.
    expect(again.result.current.known).toBe(true);
  });
});
