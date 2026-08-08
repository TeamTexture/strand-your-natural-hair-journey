import { describe, it, expect } from "vitest";
import {
  validateTipTechnique,
  validateTipReason,
} from "../../supabase/functions/_shared/tip-action";
import { applyLevelCaps } from "../../supabase/functions/_shared/tip-level-caps";

const ACTION =
  "Press a cotton pad soaked in water-based scalp cleanser along your cornrow partings, then smooth an emollient cream onto your ends.";

describe("technique must add HOW, not restate the action", () => {
  it("rejects a technique that reworders the action", () => {
    const v = validateTipTechnique({
      action: ACTION,
      technique:
        "Wipe along each exposed parting with the scalp cleanser pad, then work the emollient cream through your ends.",
    });
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("technique_duplicates_action");
  });

  it("accepts a technique with genuinely new specifics", () => {
    const v = validateTipTechnique({
      action: ACTION,
      technique:
        "Work in four quadrants, holding the pad flat with light pressure for two seconds per section; use a coin-sized amount and avoid tugging at the nape.",
    });
    expect(v.ok).toBe(true);
  });

  it("treats an omitted technique as valid", () => {
    expect(validateTipTechnique({ action: ACTION, technique: "" }).ok).toBe(true);
  });
});

describe("the reason never degrades", () => {
  it("is required and rejected when missing", () => {
    const v = validateTipReason({ reason: "", action: ACTION });
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("reason_missing");
  });

  it("survives level caps at every level", () => {
    for (const level of [1, 2, 3]) {
      const out = applyLevelCaps(level, {
        action: ACTION,
        reason:
          "Left unwiped, sweat and residue build up between the rows and loosen the braid at the root.",
        technique: "Work in four quadrants with light pressure.",
        why: "Extended prose.",
        next_time: "Try banding.",
      });
      expect(out.reason.trim().length).toBeGreaterThan(0);
      expect(out.action.trim().length).toBeGreaterThan(0);
    }
  });

  it("drops next_time and the extended why before technique at essential", () => {
    const out = applyLevelCaps(2, {
      action: ACTION,
      reason: "Residue loosens the braid at the root.",
      technique: "Work in four quadrants with light pressure.",
      why: "Extended prose.",
      next_time: "Try banding.",
    });
    expect(out.next_time).toBe("");
    expect(out.why).toBe("");
    expect(out.technique).not.toBe("");
  });
});
