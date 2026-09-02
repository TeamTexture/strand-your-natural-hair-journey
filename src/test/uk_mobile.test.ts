import { describe, expect, it } from "vitest";
import {
  formatUkMobile,
  isUkMobile,
  normaliseUkMobile,
  ukMobileError,
} from "@/lib/ukMobile";

describe("UK mobile validation", () => {
  it("accepts the three accepted formats and normalises to E.164", () => {
    expect(normaliseUkMobile("07700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("07700 900 123")).toBe("+447700900123");
    expect(normaliseUkMobile("(07700) 900-123")).toBe("+447700900123");
    expect(normaliseUkMobile("+447700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("+44 7700 900123")).toBe("+447700900123");
    expect(normaliseUkMobile("00447700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("447700900123")).toBe("+447700900123");
  });

  it("rejects wrong prefix, wrong length and non-numeric input", () => {
    expect(isUkMobile("")).toBe(false);
    expect(isUkMobile("02071234567")).toBe(false); // landline
    expect(isUkMobile("00000000000")).toBe(false); // repeating, not 07
    expect(isUkMobile("0770090012")).toBe(false); // 10 digits
    expect(isUkMobile("077009001234")).toBe(false); // 12 digits
    expect(isUkMobile("+3531234567")).toBe(false); // non-UK
    expect(isUkMobile("07700abc123")).toBe(false);
    expect(isUkMobile("07700 900 12e")).toBe(false);
  });

  it("still accepts sequential digits — that IS a valid format", () => {
    expect(normaliseUkMobile("07123456789")).toBe("+447123456789");
    expect(normaliseUkMobile("07777777777")).toBe("+447777777777");
  });

  it("gives a clear inline message", () => {
    expect(ukMobileError("07700900123")).toBe("");
    expect(ukMobileError("")).toMatch(/UK mobile/i);
    expect(ukMobileError("", false)).toBe("");
    expect(ukMobileError("07700abc")).toMatch(/Numbers only/i);
    expect(ukMobileError("0770090012")).toMatch(/too short/i);
    expect(ukMobileError("077009001234")).toMatch(/too long/i);
    expect(ukMobileError("02071234567")).toMatch(/starting 07/i);
  });

  it("displays stored numbers in local form", () => {
    expect(formatUkMobile("+447700900123")).toBe("07700 900123");
    expect(formatUkMobile(null)).toBe("");
  });
});
