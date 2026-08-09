import { describe, it, expect } from "vitest";
import {
  engagementRate, formatEngagementRate, engagementFigure, shelfItemStatus, EMPTY_METRICS,
} from "@/lib/brandMetrics";

const m = (over: Partial<typeof EMPTY_METRICS>) => ({ ...EMPTY_METRICS, ...over });

describe("engagement rate", () => {
  it("is interactors over reach", () => {
    expect(engagementRate(m({ reach: 2, interactors: 1 }))).toBe(50);
  });

  it("can never exceed 100% even when raw event counts are huge", () => {
    // The 1036% bug: 104 expands + 4 codes + 5 clicks against 11 viewers.
    expect(engagementRate(m({ reach: 11, interactors: 11, expands: 104, code_copies: 4, link_clicks: 5 }))).toBe(100);
  });

  it("has no rate at all before anyone has seen it", () => {
    expect(engagementRate(EMPTY_METRICS)).toBeNull();
    expect(formatEngagementRate(EMPTY_METRICS)).toBe("—");
  });
});

describe("engagement figures", () => {
  it("shows a dash for zero rather than targeting language", () => {
    expect(engagementFigure(0, true)).toBe("—");
    expect(engagementFigure(0, false)).toBe("—");
    expect(engagementFigure(null, false)).toBe("—");
  });

  it("gives admins exact figures and brands a range", () => {
    expect(engagementFigure(23, true)).toBe("23");
    expect(engagementFigure(23, false)).toBe("20–30");
  });
});

describe("shelf item status", () => {
  it("never calls an unapproved product live", () => {
    expect(shelfItemStatus({ approval_status: "pending", is_published: true }).label).toBe("In review");
  });

  it("distinguishes approved-and-shown from approved-and-hidden", () => {
    expect(shelfItemStatus({ approval_status: "approved", is_published: true }).label).toBe("On your page");
    expect(shelfItemStatus({ approval_status: "approved", is_published: false }).label).toBe("Hidden");
  });

  it("labels rejection plainly", () => {
    expect(shelfItemStatus({ approval_status: "rejected", is_published: false }).label).toBe("Not approved");
  });
});
