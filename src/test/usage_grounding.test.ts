import { describe, expect, it } from "vitest";
import {
  extractDirectionsFromPage,
  scrubUngroundedUsage,
  validateUsageGrounding,
  type UsageDirections,
} from "../../supabase/functions/_shared/usage-grounding.ts";

// The real Nylah's Thrive Triple Action Scalp Serum box directions.
const boxDirections: UsageDirections = {
  text:
    "Apply directly into the scalp daily using the pipette provided and massage into the scalp for five minutes.",
  source: "label_photo",
};

const noDirections: UsageDirections = { text: null, source: "none" };

describe("usage grounding", () => {
  it("rejects the invented 'damp scalp' condition", () => {
    const problems = validateUsageGrounding(
      [{ field: "body", text: "Apply directly to damp scalp partings." }],
      boxDirections,
    );
    expect(problems.map((p) => p.family)).toContain("hair_state");
  });

  it("accepts specifics the manufacturer actually stated", () => {
    const problems = validateUsageGrounding(
      [{
        field: "body",
        text:
          "Use the pipette to place the serum directly on your scalp daily, then massage for five minutes.",
      }],
      boxDirections,
    );
    expect(problems).toHaveLength(0);
  });

  it("rejects unstated amounts and timings", () => {
    const problems = validateUsageGrounding(
      [{ field: "body", text: "Use a pea-sized amount and leave it on for 20 minutes." }],
      { text: "Apply to the scalp.", source: "brand_page" },
    );
    expect(problems.map((p) => p.family).sort()).toEqual(["amount", "timing"]);
  });

  it("allows a specific only when flagged as general where no directions exist", () => {
    expect(
      validateUsageGrounding(
        [{ field: "body", text: "Apply to damp hair." }],
        noDirections,
      ),
    ).toHaveLength(1);
    expect(
      validateUsageGrounding(
        [{
          field: "body",
          text:
            "The manufacturer does not specify an amount, so as a general rule start with a pea-sized amount.",
        }],
        noDirections,
      ),
    ).toHaveLength(0);
  });

  it("scrubs only the ungrounded sentence", () => {
    const out = scrubUngroundedUsage(
      "Separate your hair into sections to expose the scalp. Apply to damp partings.",
      boxDirections,
    );
    expect(out.removed).toBe(1);
    expect(out.text).toBe("Separate your hair into sections to expose the scalp.");
  });

  it("extracts published directions from brand page text", () => {
    const found = extractDirectionsFromPage(
      "Thrive Serum. How to use: Apply directly into the scalp daily using the pipette provided and massage for five minutes. Ingredients: Aqua, Glycerin",
    );
    expect(found).toContain("pipette");
    expect(found?.toLowerCase()).not.toContain("aqua");
  });
});
