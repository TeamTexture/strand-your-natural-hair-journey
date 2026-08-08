import { describe, it, expect } from "vitest";
import { bandMemberCount, isZeroCount, NO_MEMBERS_LABEL } from "@/lib/adTargeting";

describe("bandMemberCount", () => {
  it("states zero explicitly, never as a band", () => {
    expect(bandMemberCount(0)).toBe(NO_MEMBERS_LABEL);
    expect(isZeroCount(0)).toBe(true);
  });

  it("bands 1-9 as fewer than 10", () => {
    expect(bandMemberCount(1)).toBe("Fewer than 10");
    expect(bandMemberCount(9)).toBe("Fewer than 10");
  });

  it("bands 10-49 to the nearest 10", () => {
    expect(bandMemberCount(10)).toBe("10–20");
    expect(bandMemberCount(23)).toBe("20–30");
    expect(bandMemberCount(47)).toBe("40–50");
  });

  it("bands 50-199 to the nearest 50", () => {
    expect(bandMemberCount(50)).toBe("50–100");
    expect(bandMemberCount(78)).toBe("50–100");
    expect(bandMemberCount(199)).toBe("150–200");
  });

  it("bands 200+ to the nearest 100", () => {
    expect(bandMemberCount(200)).toBe("200–300");
    expect(bandMemberCount(340)).toBe("300–400");
  });

  it("shows a dash for unknown counts", () => {
    expect(bandMemberCount(null)).toBe("—");
  });
});
