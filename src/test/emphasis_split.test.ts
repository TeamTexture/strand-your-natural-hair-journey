// Two-weight emphasis rule: a guidance block is only ever split into bold +
// lighter text when the AI's own punctuation gives a real structural boundary.
// No word-count cutting, no case mutation.

import { describe, expect, it } from "vitest";
import { emphasisSplit } from "@/lib/tipsRender";

describe("emphasisSplit", () => {
  it("splits on a genuine em-dash boundary, keeping the dash with the remainder", () => {
    const { phrase, rest } = emphasisSplit(
      "Buildup is settling on your scalp — it can restrict follicles and slow growth.",
    );
    expect(phrase).toBe("Buildup is settling on your scalp");
    expect(rest).toBe("— it can restrict follicles and slow growth.");
  });

  it("splits on a colon, keeping the colon with the phrase", () => {
    const { phrase, rest } = emphasisSplit("Next wash day: soak before you cleanse.");
    expect(phrase).toBe("Next wash day:");
    expect(rest).toBe("soak before you cleanse.");
  });

  it("never cuts mid-clause when there is no boundary — the whole block is emphasised", () => {
    const text =
      "You are currently wearing a loose natural style on your high density hair and that changes how you cleanse.";
    const { phrase, rest } = emphasisSplit(text);
    expect(phrase).toBe(text);
    expect(rest).toBe("");
  });

  it("never changes the AI's capitalisation", () => {
    const text = "Your dermatologist confirmed your hairline and scalp are healthy right now.";
    const { phrase, rest } = emphasisSplit(text);
    expect(phrase).toBe(text);
    expect(rest).toBe("");
    const dashed = emphasisSplit("Ferritin is low — and that slows your growth phase.");
    expect(dashed.rest).toBe("— and that slows your growth phase.");
    expect(dashed.rest.includes("And")).toBe(false);
  });

  it("ignores boundaries that appear late in the string", () => {
    const text =
      "Your hair is coping well with the current routine — keep going for another two weeks.";
    const { phrase, rest } = emphasisSplit(text);
    expect(rest).toBe("");
    expect(phrase).toBe(text);
  });

  it("ignores a colon inside a clock time", () => {
    const { phrase, rest } = emphasisSplit("Rinse at 9:30 before you leave the house.");
    expect(rest).toBe("");
    expect(phrase).toBe("Rinse at 9:30 before you leave the house.");
  });

  it("reassembling the two weights loses nothing but the separator spacing", () => {
    const text = "Buildup is settling — it can restrict follicles.";
    const { phrase, rest } = emphasisSplit(text);
    expect(`${phrase} ${rest}`.trim()).toBe(text);
  });

  it("handles empty input", () => {
    expect(emphasisSplit("")).toEqual({ phrase: "", rest: "" });
  });
});
