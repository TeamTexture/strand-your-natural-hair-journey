import { describe, it, expect } from "vitest";
import { isFeaturedToday } from "@/hooks/useDirectoryProfessionals";

const base = {
  is_published: true,
  profile_review_status: "approved",
  featured_from: null as string | null,
  featured_until: null as string | null,
};

describe("featured directory slot window", () => {
  it("is off when all three fields are unset", () => {
    expect(isFeaturedToday(base, "2026-08-25")).toBe(false);
  });

  it("is on inside an inclusive window", () => {
    const row = { ...base, featured_from: "2026-08-20", featured_until: "2026-08-25" };
    expect(isFeaturedToday(row, "2026-08-20")).toBe(true);
    expect(isFeaturedToday(row, "2026-08-25")).toBe(true);
    expect(isFeaturedToday(row, "2026-08-19")).toBe(false);
    expect(isFeaturedToday(row, "2026-08-26")).toBe(false);
  });

  it("treats a null start as already started when an end is set", () => {
    expect(isFeaturedToday({ ...base, featured_until: "2026-08-25" }, "2026-01-01")).toBe(true);
    expect(isFeaturedToday({ ...base, featured_until: "2026-08-25" }, "2026-08-26")).toBe(false);
  });

  it("treats a null end as open-ended when a start is set", () => {
    expect(isFeaturedToday({ ...base, featured_from: "2026-08-01" }, "2027-01-01")).toBe(true);
    expect(isFeaturedToday({ ...base, featured_from: "2026-08-01" }, "2026-07-31")).toBe(false);
  });

  it("requires published and approved", () => {
    const row = { ...base, featured_from: "2026-08-01", featured_until: "2026-12-01" };
    expect(isFeaturedToday({ ...row, is_published: false }, "2026-08-25")).toBe(false);
    expect(isFeaturedToday({ ...row, profile_review_status: "submitted" }, "2026-08-25")).toBe(false);
  });
});
