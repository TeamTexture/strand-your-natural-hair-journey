import { describe, it, expect } from "vitest";
import {
  CANONICAL_STYLES,
  CANONICAL_STYLE_OPTIONS,
  HAIRSTYLE_OPTIONS,
  OTHER_STYLE,
  styleCanTakeExtensions,
} from "@/lib/hairstyles";

describe("canonical style list", () => {
  it("preserves the existing user_style_profile values", () => {
    for (const v of [
      "Locs", "Loose natural", "Box braids", "Wash and go",
      "Twist-out", "Low manipulation natural style",
    ]) expect(CANONICAL_STYLE_OPTIONS).toContain(v);
  });

  it("adds the new styles, keeping Twists distinct from Twist-out", () => {
    for (const v of ["Low bun", "Straight back cornrows", "Twists", OTHER_STYLE])
      expect(CANONICAL_STYLE_OPTIONS).toContain(v);
    expect(CANONICAL_STYLE_OPTIONS).toContain("Twist-out");
  });

  it("exposes every canonical style (bar Other) to the profile pickers too", () => {
    for (const v of CANONICAL_STYLE_OPTIONS.filter((s) => s !== OTHER_STYLE))
      expect(HAIRSTYLE_OPTIONS).toContain(v);
  });

  it("flags extensions only where they apply", () => {
    expect(CANONICAL_STYLES.filter((s) => s.canTakeExtensions).map((s) => s.value)).toEqual([
      "Locs", "Box braids", "Low bun", "Straight back cornrows", "Twists",
    ]);
    expect(styleCanTakeExtensions("box braids")).toBe(true);
    expect(styleCanTakeExtensions("Wash and go")).toBe(false);
  });
});
