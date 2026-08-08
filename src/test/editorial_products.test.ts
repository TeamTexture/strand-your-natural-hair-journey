import { describe, it, expect } from "vitest";
import {
  findExcludedProducts,
  redactProductNames,
  minimalCapViolations,
  trimToCap,
  MINIMAL_ACTION_WORD_CAP,
  MINIMAL_REASON_WORD_CAP,
  wordCount,
} from "../../supabase/functions/_shared/editorial-products";

const SPONSORED = ["Ultra Moisture Nourishing Leave-In Conditioner"];

describe("paid-media wall", () => {
  it("catches a sponsored product named anywhere in the tip payload", () => {
    const payload = {
      headline: "Seal your ends",
      action:
        "Smooth your CANTU Ultra Moisture Nourishing Leave-In Conditioner over your ends before banding.",
      reason: "High porosity ends lose water fastest.",
    };
    expect(findExcludedProducts(payload, SPONSORED)).toEqual(SPONSORED);
  });

  it("passes a clean tip that names nothing sponsored", () => {
    const payload = { action: "Smooth a creamy leave-in over your ends.", reason: "why" };
    expect(findExcludedProducts(payload, SPONSORED)).toEqual([]);
  });

  it("redacts the product name and the brand word glued to it", () => {
    const out = redactProductNames(
      { action: "Smooth your CANTU Ultra Moisture Nourishing Leave-In Conditioner onto your ends." },
      SPONSORED,
    );
    expect(out.action).not.toMatch(/cantu/i);
    expect(out.action).not.toMatch(/ultra moisture/i);
    expect(out.action).toContain("your own shelf");
    expect(out.action.endsWith("onto your ends.")).toBe(true);
  });
});

describe("minimal level word caps", () => {
  it("flags an over-long action and reason", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    expect(minimalCapViolations({ action: long, reason: long })).toEqual([
      "action_over_minimal_cap",
      "reason_over_minimal_cap",
    ]);
  });

  it("accepts copy inside the caps", () => {
    expect(
      minimalCapViolations({
        action: "Smooth a creamy leave-in down your ends, then band them before bed.",
        reason: "High porosity ends lose water fastest overnight.",
      }),
    ).toEqual([]);
  });

  it("trims to the first sentence when the model overruns", () => {
    const s =
      "Smooth a creamy leave-in down your ends. Then band each twist and leave it overnight to hold the moisture in place for longer.";
    const trimmed = trimToCap(s, MINIMAL_ACTION_WORD_CAP);
    expect(trimmed).toBe("Smooth a creamy leave-in down your ends.");
    expect(wordCount(trimmed)).toBeLessThanOrEqual(MINIMAL_ACTION_WORD_CAP);
  });

  it("hard-cuts a single runaway sentence rather than returning nothing", () => {
    const s = Array.from({ length: 40 }, () => "word").join(" ");
    const trimmed = trimToCap(s, MINIMAL_REASON_WORD_CAP);
    expect(wordCount(trimmed)).toBe(MINIMAL_REASON_WORD_CAP);
    expect(trimmed.length).toBeGreaterThan(0);
  });
});
