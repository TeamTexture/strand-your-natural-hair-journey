import { describe, it, expect } from "vitest";
import { SKIPPABLE_STEPS, WASH_LOG_GROUPS } from "@/lib/washLogSteps";

describe("wash day skippable steps", () => {
  it("offers skip on pre-poo and both mask slots only", () => {
    expect([...SKIPPABLE_STEPS].sort()).toEqual(["Mask", "Mask 2", "Pre-poo"]);
  });

  it("never offers skip on cleanse or condition", () => {
    const groups = WASH_LOG_GROUPS.filter((g) => ["cleanse", "condition"].includes(g.key));
    expect(groups).toHaveLength(2);
    groups.forEach((g) => expect(g.skippable).toBeFalsy());
  });
});
