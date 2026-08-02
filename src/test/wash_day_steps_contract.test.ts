// wash-day-steps contract tests — the personalised, runtime-generated wash day
// sequence. Guards the word caps, the one-idea-once rule and the per-level
// step budget.

import { describe, expect, it } from "vitest";
import {
  capWords,
  normaliseSteps,
  STEP_BUDGET,
} from "../../supabase/functions/wash-day-steps/normalise";

const step = (headline: string, body = "Do the thing now.", extra: Record<string, unknown> = {}) => ({
  headline,
  body,
  ...extra,
});

describe("wash-day-steps output contract", () => {
  it("caps headline at 8 words, body at 30, why at 15", () => {
    const out = normaliseSteps(
      [
        step(
          "one two three four five six seven eight nine ten",
          Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "),
          { why: Array.from({ length: 25 }, (_, i) => `y${i}`).join(" ") },
        ),
      ],
      3,
    );
    expect(out).toHaveLength(1);
    expect(out[0].headline.split(" ")).toHaveLength(8);
    expect(out[0].body.split(" ")).toHaveLength(30);
    expect(out[0].why!.split(" ")).toHaveLength(15);
  });

  it("omits the why line when the model gives none", () => {
    const out = normaliseSteps([step("Soak your hair fully")], 3);
    expect(out[0].why).toBeUndefined();
  });

  it("drops repeated headlines (one idea, once) and renumbers", () => {
    const out = normaliseSteps(
      [step("Cleanse your scalp first"), step("cleanse your scalp first!"), step("Condition every wash")],
      3,
    );
    expect(out.map((s) => s.headline)).toEqual([
      "Cleanse your scalp first",
      "Condition every wash",
    ]);
    expect(out.map((s) => s.n)).toEqual([1, 2]);
  });

  it("honours the step budget for every support level", () => {
    const many = Array.from({ length: 20 }, (_, i) => step(`Step number ${i}`));
    for (const level of [1, 2, 3, 4]) {
      const out = normaliseSteps(many, level);
      expect(out.length).toBe(STEP_BUDGET[level].max);
    }
    expect(normaliseSteps(many, 1).length).toBeLessThan(normaliseSteps(many, 3).length);
  });

  it("keeps icon and product references, and rejects unusable steps", () => {
    const out = normaliseSteps(
      [
        step("Condition and detangle", "Work it through.", {
          icon_hint: "condition",
          product_ref: "Kinky Curly Knot Today",
        }),
        { headline: "", body: "no headline" },
        { headline: "No body given" },
      ],
      3,
    );
    expect(out).toHaveLength(1);
    expect(out[0].icon_hint).toBe("condition");
    expect(out[0].product_ref).toBe("Kinky Curly Knot Today");
  });

  it("returns nothing when the model output is not a list", () => {
    expect(normaliseSteps(null, 3)).toEqual([]);
    expect(normaliseSteps("steps", 3)).toEqual([]);
  });

  it("capWords does not leave dangling punctuation", () => {
    expect(capWords("wash your scalp first, then the hair", 5)).toBe("wash your scalp first");
  });
});
