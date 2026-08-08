import { describe, it, expect } from "vitest";
import {
  findProductNames,
  redactProductNames,
  noProductNamesBlock,
  minimalCapViolations,
  trimToCap,
  MINIMAL_ACTION_WORD_CAP,
  MINIMAL_REASON_WORD_CAP,
  wordCount,
} from "../../supabase/functions/_shared/product-name-wall";

// The forbidden set is EVERY product name — catalogue and the member's own
// shelf alike. There is no exclusion list any more.
const NAMES = [
  "Ultra Moisture Nourishing Leave-In Conditioner",
  "Thrive Triple Action Hair Growth Serum",
  "Morte Súbita Mask",
];

describe("no product names in the editorial tip", () => {
  it("catches a sponsored product named anywhere in the payload", () => {
    const payload = {
      headline: "Seal your ends",
      action:
        "Smooth your CANTU Ultra Moisture Nourishing Leave-In Conditioner over your ends before banding.",
      reason: "High porosity ends lose water fastest.",
    };
    expect(findProductNames(payload, NAMES)).toEqual([NAMES[0]]);
  });

  it("catches a product the member owns — owning it is no longer a licence to name it", () => {
    expect(
      findProductNames({ technique: "Use your Morte Súbita Mask midweek." }, NAMES),
    ).toEqual([NAMES[2]]);
  });

  it("catches every named product when more than one leaks", () => {
    const payload = {
      action:
        "Apply the Thrive Triple Action Hair Growth Serum to your edges and smooth the Ultra Moisture Nourishing Leave-In Conditioner onto your ends.",
    };
    expect(findProductNames(payload, NAMES).sort()).toEqual(
      [NAMES[0], NAMES[1]].sort(),
    );
  });

  it("passes a purely educational tip that names only product types", () => {
    const payload = {
      headline: "Clean Between The Rows",
      action:
        "Wipe a water-based scalp cleanser along each exposed cornrow parting with a cotton pad, then seal your ends with an emollient leave-in.",
      reason: "Cleaning the exposed partings keeps the follicles clear while the style stays in.",
      technique: "Work row by row, ends only for the leave-in — nothing on the scalp.",
    };
    expect(findProductNames(payload, NAMES)).toEqual([]);
  });

  it("redacts the product name and the brand word glued to it", () => {
    const out = redactProductNames(
      { action: "Smooth your CANTU Ultra Moisture Nourishing Leave-In Conditioner onto your ends." },
      [NAMES[0]],
    );
    expect(out.action).not.toMatch(/cantu/i);
    expect(out.action).not.toMatch(/ultra moisture/i);
    expect(out.action).toContain("a suitable product of that type");
    expect(out.action.endsWith("onto your ends.")).toBe(true);
  });

  it("states the rule without shipping an exclusion list", () => {
    const block = noProductNamesBlock();
    expect(block).toMatch(/NO PRODUCT NAMES/);
    expect(block).not.toMatch(/paid campaign/i);
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
