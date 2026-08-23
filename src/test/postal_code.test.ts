import { describe, it, expect } from "vitest";
import { postalCodeError, postalConfigFor, formatPostalInput } from "@/lib/postalCode";
describe("postal", () => {
  it("uk", () => {
    expect(postalCodeError("SW6 3BX", "United Kingdom")).toBe("");
    expect(postalCodeError("sw63bx", "United Kingdom")).toBe("");
    expect(postalCodeError("SW6", "United Kingdom")).not.toBe("");
    expect(postalConfigFor("United Kingdom").label).toBe("Postcode");
  });
  it("us + generic", () => {
    expect(postalCodeError("10012", "United States")).toBe("");
    expect(postalConfigFor("United States").label).toBe("ZIP code");
    expect(postalCodeError("12ab-x", "Ghana")).toBe("");
    expect(postalCodeError("", "Ghana")).not.toBe("");
    expect(formatPostalInput("m5v 2t6", "Canada")).toBe("M5V 2T6");
  });
});
