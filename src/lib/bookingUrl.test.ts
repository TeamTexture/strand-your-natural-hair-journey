import { describe, expect, it } from "vitest";
import { isValidBookingUrl, normalizeBookingUrl } from "@/lib/bookingUrl";

describe("normalizeBookingUrl", () => {
  it("upgrades http and bare hosts to https", () => {
    expect(normalizeBookingUrl("http://book.me/x")).toBe("https://book.me/x");
    expect(normalizeBookingUrl("book.me/x")).toBe("https://book.me/x");
    expect(normalizeBookingUrl("//book.me/x")).toBe("https://book.me/x");
  });
  it("returns empty for blank input", () => {
    expect(normalizeBookingUrl("   ")).toBe("");
    expect(normalizeBookingUrl(null)).toBe("");
  });
});

describe("isValidBookingUrl", () => {
  it("accepts real https destinations", () => {
    expect(isValidBookingUrl("https://www.fresha.com/salon/book")).toBe(true);
    expect(isValidBookingUrl("treatwell.co.uk/place/123")).toBe(true);
  });
  it("rejects hostless, spaced or non-web links", () => {
    expect(isValidBookingUrl("https://localhost")).toBe(false);
    expect(isValidBookingUrl("book me now")).toBe(false);
    expect(isValidBookingUrl("")).toBe(false);
  });
});
