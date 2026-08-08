import { describe, it, expect } from "vitest";
import {
  STRAND_GOLD,
  contrastRatio,
  ensureReadable,
  fallbackBrandColours,
  resolveBrandColours,
} from "@/lib/brandColour";

/**
 * Contrast guardrails for the sponsored wash day card. Text is never rendered
 * on a brand colour that fails 4.5:1 — the stored colour is nudged until it
 * passes, and a missing/broken extraction falls back to the STRAND gold token.
 */
describe("brand colour contrast", () => {
  it("returns a readable pair for any input colour", () => {
    for (const hex of ["#ffffff", "#000000", "#c69739", "#ffff00", "#7f7f7f", "#0000ff"]) {
      const { colour, text } = ensureReadable(hex);
      expect(contrastRatio(colour, text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to STRAND gold when no logo colour is stored", () => {
    const c = resolveBrandColours(null);
    expect(c.primary.toLowerCase()).toBe(fallbackBrandColours().primary.toLowerCase());
    expect(contrastRatio(c.primary, c.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back when the stored value is not a usable hex", () => {
    const c = resolveBrandColours({ brand_colour_primary: "not-a-colour" });
    expect(contrastRatio(c.primary, c.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a stored brand colour but guarantees readable text on it", () => {
    const c = resolveBrandColours({ brand_colour_primary: "#ffe600" });
    expect(contrastRatio(c.primary, c.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("gold token itself passes with its computed text colour", () => {
    const { colour, text } = ensureReadable(STRAND_GOLD);
    expect(contrastRatio(colour, text)).toBeGreaterThanOrEqual(4.5);
  });
});
