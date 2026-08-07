/**
 * Brand shelf product visibility.
 *
 * Admin approval is the ONLY gate on public visibility. There is no separate
 * publish step: a newly created product defaults to visible-once-approved, and
 * the `is_published` column now only ever records a deliberate brand-side Hide.
 *
 * This mirrors `brand_shelf_products()`:
 *   approval_status = 'approved' AND is_published
 */
import { describe, it, expect } from "vitest";

type Row = { approval_status: "pending" | "approved" | "rejected"; is_published: boolean };

const isPubliclyVisible = (r: Row) => r.approval_status === "approved" && r.is_published;

/** Column default after the single-step-approval migration. */
const newProduct = (): Row => ({ approval_status: "pending", is_published: true });

/** What the approval trigger does when an admin approves. */
const approve = (r: Row): Row => ({ ...r, approval_status: "approved", is_published: true });

/** What the trigger / admin hook does on rejection — Hide state untouched. */
const reject = (r: Row): Row => ({ ...r, approval_status: "rejected" });

/** Brand-side Hide control. */
const setHidden = (r: Row, hidden: boolean): Row => ({ ...r, is_published: !hidden });

describe("brand product visibility", () => {
  it("is not visible while pending", () => {
    expect(isPubliclyVisible(newProduct())).toBe(false);
  });

  it("becomes visible on approval with no second step", () => {
    expect(isPubliclyVisible(approve(newProduct()))).toBe(true);
  });

  it("disappears immediately when un-approved or rejected", () => {
    expect(isPubliclyVisible(reject(approve(newProduct())))).toBe(false);
  });

  it("respects a deliberate brand Hide after approval", () => {
    const live = approve(newProduct());
    expect(isPubliclyVisible(setHidden(live, true))).toBe(false);
    expect(isPubliclyVisible(setHidden(setHidden(live, true), false))).toBe(true);
  });

  it("never leaves an approved product invisible by default", () => {
    // No path sets is_published false except the brand's own Hide.
    expect(approve(newProduct()).is_published).toBe(true);
    expect(reject(approve(newProduct())).is_published).toBe(true);
  });
});
