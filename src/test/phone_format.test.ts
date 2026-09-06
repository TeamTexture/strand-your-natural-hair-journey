import { describe, expect, it } from "vitest";
import { formatPhone, phoneError, splitStoredPhone, toE164 } from "@/lib/phone";

describe("shared phone normalisation", () => {
  it("strips a typed trunk zero and stores E.164", () => {
    expect(toE164("44", "07583748033")).toBe("+447583748033");
    expect(toE164("44", "7583 748033")).toBe("+447583748033");
    expect(toE164("44", "+44 7583 748033")).toBe("+447583748033");
  });

  it("rejects numbers that are wrong for the selected country", () => {
    expect(toE164("44", "0758374803")).toBeNull(); // too short
    expect(toE164("44", "02071234567")).toBeNull(); // landline, not a mobile
    expect(phoneError("44", "0758374803")).toMatch(/too short/i);
    expect(phoneError("44", "")).toMatch(/mobile number/i);
    expect(phoneError("44", "07583748033")).toBe("");
  });

  it("supports other countries", () => {
    expect(toE164("234", "08012345678")).toBe("+2348012345678");
    expect(toE164("1", "2125551234")).toBe("+12125551234");
  });

  it("reopens legacy local-format rows against the UK code", () => {
    expect(splitStoredPhone("07700 900123")).toEqual({ dial: "44", local: "7700900123" });
    expect(splitStoredPhone("+447700900123")).toEqual({ dial: "44", local: "7700900123" });
    expect(formatPhone("+447700900123")).toBe("+44 7700 900123");
  });
});
