import { describe, it, expect } from "vitest";
import {
  selectBookingCheck,
  GRACE_DAYS,
  LAPSE_DAYS,
  type EnquiryLike,
} from "@/components/booking/EnquiryBookingCheckDialog";

const DAY = 86400000;
const NOW = Date.parse("2026-09-08T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const enq = (id: string, pro: string, days: number): EnquiryLike => ({
  id,
  pro_user_id: pro,
  responded_at: ago(days),
  created_at: ago(days + 1),
});

const none = () => false;

describe("selectBookingCheck", () => {
  it("waits out the grace period", () => {
    const fresh = selectBookingCheck([enq("a", "p1", GRACE_DAYS - 1)], new Set(), none, NOW);
    expect(fresh.due).toBeNull();
    const ready = selectBookingCheck([enq("a", "p1", GRACE_DAYS)], new Set(), none, NOW);
    expect(ready.due?.id).toBe("a");
  });

  it("never asks about a professional she already has an appointment with", () => {
    const r = selectBookingCheck([enq("a", "p1", 10)], new Set(["p1"]), none, NOW);
    expect(r.due).toBeNull();
  });

  it("respects a permanent per-enquiry dismissal", () => {
    const r = selectBookingCheck([enq("a", "p1", 10)], new Set(), (id) => id === "a", NOW);
    expect(r.due).toBeNull();
  });

  it("silences a stale enquiry instead of asking", () => {
    const r = selectBookingCheck([enq("a", "p1", LAPSE_DAYS + 1)], new Set(), none, NOW);
    expect(r.due).toBeNull();
    expect(r.lapsed.map((e) => e.id)).toEqual(["a"]);
  });

  it("asks about the oldest eligible enquiry first, one at a time", () => {
    const r = selectBookingCheck(
      [enq("new", "p2", 4), enq("old", "p1", 20)],
      new Set(),
      none,
      NOW,
    );
    expect(r.due?.id).toBe("old");
  });

  it("falls back to the enquiry date when acceptance was never stamped", () => {
    const r = selectBookingCheck(
      [{ id: "a", pro_user_id: "p1", responded_at: null, created_at: ago(9) }],
      new Set(),
      none,
      NOW,
    );
    expect(r.due?.id).toBe("a");
  });
});
