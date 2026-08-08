// TIP QUALITY FLOOR — method presence + tautology rejection.
//
// The live defect this locks down (home page goal tip):
//   headline: "Maintain Moisture and Protect Hair Underneath Cornrows"
//   body: "Protecting the hair underneath your cornrows prevents the daily
//          friction and moisture loss that snaps high-porosity strands…"
// That restates the goal as its own benefit and names no method.

import { describe, it, expect } from "vitest";
import {
  methodSignals,
  validateTipMethod,
  validateTipTautology,
  validateTipSubstance,
} from "../../supabase/functions/_shared/tip-method";
import {
  proceduralScore,
  PROCEDURAL_BAR,
} from "../../supabase/functions/_shared/procedural-rag";

const LIVE_HEADLINE = "Maintain Moisture and Protect Hair Underneath Cornrows";
const LIVE_BODY =
  "Protecting the hair underneath your cornrows prevents the daily friction and moisture loss that snaps high-porosity strands, keeping you on track for long, thick Afro hair.";

describe("method presence", () => {
  it("rejects the live tautological goal tip", () => {
    const verdict = validateTipSubstance({ headline: LIVE_HEADLINE, body: LIVE_BODY });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });

  it("rejects outcome-only bodies with no method", () => {
    const v = validateTipMethod({
      text: "Keep prioritising moisture so your length stays on track.",
    });
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("no_method_named");
    expect(v.reasons).toContain("outcome_only_language");
  });

  it("accepts a body with a named intervention and a timing", () => {
    const v = validateTipMethod({
      text:
        "Apply a deep conditioning treatment under a heat source for 20 minutes the night before you install the cornrows.",
    });
    expect(v.ok).toBe(true);
    expect(v.signals).toContain("intervention");
    expect(v.signals).toContain("timing");
    expect(v.signals).toContain("cadence");
  });

  it("flags a body with a timing but no method verb or intervention", () => {
    const v = validateTipMethod({ text: "Do it before installing, every fortnight." });
    expect(v.ok).toBe(false);
  });
});

describe("tautology", () => {
  it("rejects justification that restates the headline goal", () => {
    const v = validateTipTautology({ headline: LIVE_HEADLINE, body: LIVE_BODY });
    expect(v.ok).toBe(false);
  });

  it("accepts a mechanism-bearing justification with a method", () => {
    const v = validateTipTautology({
      headline: "Rehydrate after take-down",
      body:
        "Apply a moisturising treatment with heat immediately after taking the cornrows down, because the strand has had weeks without a full conditioning pass.",
    });
    expect(v.ok).toBe(true);
  });

  it("does not flag a short headline with an unrelated method body", () => {
    const v = validateTipTautology({
      headline: "Cleanse between the rows",
      body:
        "Wipe a scalp cleanser along each exposed parting with a cotton pad mid-week, working row by row.",
    });
    expect(v.ok).toBe(true);
  });
});

describe("procedural scoring of manuscript passages", () => {
  it("scores an instruction-bearing passage above the bar", () => {
    const procedural =
      "Start by sectioning the hair into four. Apply the conditioner from root to tip, then cover it and leave it for 20 minutes before rinsing. Repeat this every wash day.";
    expect(proceduralScore(procedural)).toBeGreaterThanOrEqual(PROCEDURAL_BAR);
  });

  it("scores thematic discussion below the bar", () => {
    const thematic =
      "The concept of my unstyled Afro being an unfinished, incomplete, shameful mess continues to haunt me, even to this day, whenever I walk through the market.";
    expect(proceduralScore(thematic)).toBeLessThan(PROCEDURAL_BAR);
  });

  it("methodSignals reports what a line carries", () => {
    expect(methodSignals("Rinse with cool water for 30 seconds after conditioning."))
      .toEqual(expect.arrayContaining(["method_verb", "timing", "cadence"]));
  });
});
