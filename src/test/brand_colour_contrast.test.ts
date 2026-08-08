import { describe, it, expect } from "vitest";
import {
  CARD_SURFACE,
  STRAND_GOLD,
  contrastRatio,
  ensureReadable,
  fallbackBrandColours,
  pickDominantColours,
  pickReadableTextColour,
  resolveBrandColours,
  textSafeAccent,
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

describe("dominant-area extraction (Cantu case)", () => {
  // Synthetic stand-in for the Cantu logo: a large orange field, a white
  // wordmark, and a thin multi-colour accent stripe. The stripe must never win.
  function synthetic() {
    const px: number[] = [];
    const push = (r: number, g: number, b: number, n: number) => {
      for (let i = 0; i < n; i++) px.push(r, g, b, 255);
    };
    push(252, 76, 1, 3400); // orange field
    push(255, 255, 255, 700); // wordmark
    push(122, 35, 64, 60); // maroon stripe
    push(244, 168, 45, 55); // yellow stripe
    return px;
  }

  it("picks the dominant field colour, not an accent stripe", () => {
    const picked = pickDominantColours(synthetic());
    expect(picked).not.toBeNull();
    expect(picked!.primary.toLowerCase()).toBe("#fc4c01");
    expect(picked!.share).toBeGreaterThan(0.8);
    expect(picked!.secondary.toLowerCase()).not.toBe("#fc4c01");
  });

  it("keeps the original colour for tints but darkens it for text", () => {
    const accent = textSafeAccent("#fc4c01");
    expect(accent.toLowerCase()).not.toBe("#fc4c01");
    expect(contrastRatio(accent, CARD_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pickReadableTextColour(accent), accent)).toBeGreaterThanOrEqual(4.5);
  });
});
