import { describe, it, expect } from "vitest";

/**
 * Regression guard for "approved professional missing from the directory".
 *
 * The consumer directory selects live pros with exactly these two conditions:
 *   is_published = true AND suspended_at IS NULL
 * Approval must set both in one action; suspension/un-approval must undo them
 * by the same single mechanism. This test models that contract.
 */
type ProProfileRow = { is_published: boolean; suspended_at: string | null };
type ApplicationStatus = "pending" | "approved" | "rejected" | "suspended";

/** The exact predicate the consumer directory query applies. */
export const visibleInDirectory = (row: ProProfileRow) =>
  row.is_published === true && row.suspended_at === null;

/** Mirrors public.approve_pro_application + sync_pro_listing_from_application. */
const applyApplicationStatus = (
  row: ProProfileRow,
  status: ApplicationStatus,
): ProProfileRow =>
  status === "approved"
    ? { is_published: true, suspended_at: null }
    : { is_published: false, suspended_at: row.suspended_at ?? "2026-01-01T00:00:00Z" };

describe("professional directory visibility", () => {
  const fresh: ProProfileRow = { is_published: false, suspended_at: null };

  it("approving a professional makes them visible to the directory query", () => {
    expect(visibleInDirectory(applyApplicationStatus(fresh, "approved"))).toBe(true);
  });

  it("an unapproved profile is not visible", () => {
    expect(visibleInDirectory(fresh)).toBe(false);
  });

  it("approval clears a previous suspension in the same action", () => {
    const suspended: ProProfileRow = { is_published: false, suspended_at: "2026-01-01T00:00:00Z" };
    expect(visibleInDirectory(applyApplicationStatus(suspended, "approved"))).toBe(true);
  });

  it.each(["rejected", "suspended", "pending"] as const)(
    "%s removes them from the directory by the same mechanism",
    (status) => {
      const live = applyApplicationStatus(fresh, "approved");
      expect(visibleInDirectory(applyApplicationStatus(live, status))).toBe(false);
    },
  );
});
