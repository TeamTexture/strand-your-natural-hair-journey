import { describe, it, expect } from "vitest";
import { washStepLabel, rollUpStepHeat, anyStepUsedHeat } from "@/lib/washSteps";

describe("wash step labels", () => {
  it("shows Treatment as Treatment / Mask without changing the stored name", () => {
    expect(washStepLabel("Treatment")).toBe("Treatment / Mask");
    expect(washStepLabel("Condition")).toBe("Condition");
  });

  it("falls back to the stored string for unknown steps", () => {
    expect(washStepLabel("Steam")).toBe("Steam");
    expect(washStepLabel(undefined)).toBe("");
  });
});

describe("per-step heat roll-up", () => {
  it("returns null when no step answered the heat question", () => {
    expect(rollUpStepHeat([{ heat: null }, {}])).toBeNull();
  });

  it("returns used:false when every answer was no", () => {
    expect(rollUpStepHeat([{ heat: { used: false } }])).toEqual({ used: false });
  });

  it("totals duration and unions tools across steps", () => {
    const rolled = rollUpStepHeat([
      { heat: { used: true, duration_min: 20, tool_ids: ["a"], tools: ["TT Heat Hat"] } },
      { heat: { used: true, duration_min: 15, tool_ids: ["a", "b"], tools: ["TT Heat Hat", "Other"] } },
      { heat: { used: false } },
    ]);
    expect(rolled).toEqual({
      used: true,
      duration_min: 35,
      tool_ids: ["a", "b"],
      tools: ["TT Heat Hat", "Other"],
    });
  });

  it("detects heat anywhere in the log for the cool-down tip", () => {
    expect(anyStepUsedHeat([{ heat: { used: false } }, { heat: { used: true } }])).toBe(true);
    expect(anyStepUsedHeat([{ heat: { used: false } }, {}])).toBe(false);
  });
});
