import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEAR_BLACK,
  NEAR_WHITE,
  contrastRatio,
  hexToRgb,
  pickDominantColours,
  textSafeAccent,
  CARD_SURFACE,
} from "@/lib/brandColour";

/** The real CANTU logo, downscaled to 100×100 and stored as raw RGBA so the
 *  production quantiser runs against genuine pixels (no synthetic stand-in). */
function cantuPixels(): Uint8ClampedArray {
  const b64 = readFileSync(join(__dirname, "fixtures/cantu-logo-100.rgba.b64"), "utf8");
  return new Uint8ClampedArray(Buffer.from(b64.trim(), "base64"));
}

/** Solid block of one colour, `count` pixels long. */
function block(hex: string, count: number): number[] {
  const [r, g, b] = hexToRgb(hex)!;
  return Array.from({ length: count }, () => [r, g, b, 255]).flat();
}

const hue = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
};

describe("brand primary = largest area (real CANTU logo)", () => {
  const picked = pickDominantColours(cantuPixels())!;

  it("returns the orange-red field, not a stripe colour or white", () => {
    // Report the numbers the rule is judged on.
    // eslint-disable-next-line no-console
    console.log(
      `CANTU primary ${picked.primary} @ ${(picked.share * 100).toFixed(1)}% area, ` +
        `secondary ${picked.secondary} @ ${(picked.secondaryShare * 100).toFixed(1)}%`,
    );
    expect(picked.share).toBeGreaterThan(0.5);
    // Orange-red: hue in the 5–35° band, red channel clearly dominant.
    expect(hue(picked.primary)).toBeGreaterThan(4);
    expect(hue(picked.primary)).toBeLessThan(35);
    const [r, g, b] = hexToRgb(picked.primary)!;
    expect(r).toBeGreaterThan(200);
    expect(r - g).toBeGreaterThan(90);
    expect(r - b).toBeGreaterThan(90);
  });

  it("text-safe accent clears 4.5:1 on the cream card surface", () => {
    expect(contrastRatio(textSafeAccent(picked.primary), CARD_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("area-share rule", () => {
  it("a large dull field beats a small vivid accent", () => {
    // 900 px of muted brown vs 100 px of maximally vivid magenta.
    const data = [...block("#7a6a58", 900), ...block("#ff00ff", 100)];
    const picked = pickDominantColours(data)!;
    expect(hue(picked.primary)).toBeLessThan(60);
    expect(picked.share).toBeCloseTo(0.9, 1);
  });

  it("excludes near-white and near-black before counting", () => {
    // White dominates by area but must not win; nor may the black outline.
    const data = [...block("#ffffff", 800), ...block("#000000", 150), ...block("#1f7a3f", 50)];
    const picked = pickDominantColours(data)!;
    expect(picked.primary.toLowerCase()).toBe("#1f7a3f");
    expect(picked.share).toBe(1); // the only counted pixels
  });

  it("uses the stated lightness thresholds", () => {
    expect(NEAR_WHITE).toBe(0.92);
    expect(NEAR_BLACK).toBe(0.08);
    // 93% lightness grey is dropped, 90% is kept.
    expect(pickDominantColours(block("#eeeeee", 100))).toBeNull();
    expect(pickDominantColours(block("#e5e5e5", 100))).not.toBeNull();
  });

  it("returns null when every pixel is discarded", () => {
    expect(pickDominantColours(block("#ffffff", 400))).toBeNull();
  });
});
