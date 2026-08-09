// MANUSCRIPT FIDELITY — regression tests for the two verified errors the app
// produced, plus the surface→chapter contract.
//
// These are the author's own facts. If a test here fails, the app is about to
// tell a member something her book contradicts.

import { describe, expect, it } from "vitest";
import {
  checkDeterministicRules,
} from "../../supabase/functions/_shared/fidelity.ts";
import {
  chaptersForSurface,
  LANGUAGE_CHAPTER,
  SURFACE_CHAPTERS,
} from "../../supabase/functions/_shared/chapter-context.ts";

describe("two-cleanse protocol", () => {
  it("rejects the reversed order (first cleanse on the scalp)", () => {
    const v = checkDeterministicRules(
      "Start with your first cleanse focused on the scalp, then move to the lengths.",
    );
    expect(v.map((x) => x.rule)).toContain("cleanse-order");
  });

  it("rejects a second cleanse aimed at the lengths", () => {
    const v = checkDeterministicRules(
      "Your second cleanse should target the lengths of your hair.",
    );
    expect(v.map((x) => x.rule)).toContain("cleanse-order");
  });

  it("accepts the correct order", () => {
    const v = checkDeterministicRules(
      "Your first cleanse works through the lengths. The second cleanse is where you focus on the scalp.",
    );
    expect(v.map((x) => x.rule)).not.toContain("cleanse-order");
  });
});

describe("leave-in behaviour", () => {
  it("rejects a leave-in described as hydrating", () => {
    const v = checkDeterministicRules("Your leave-in hydrates the hair all week.");
    expect(v.map((x) => x.rule)).toContain("leave-in-hydrates");
  });

  it("rejects a leave-in described as adding moisture", () => {
    const v = checkDeterministicRules(
      "Apply a leave-in to add moisture to your mid-lengths.",
    );
    expect(v.map((x) => x.rule)).toContain("leave-in-hydrates");
  });

  it("accepts the barrier framing", () => {
    const v = checkDeterministicRules(
      "Your leave-in sits over damp hair and slows how quickly that water leaves the strand.",
    );
    expect(v).toHaveLength(0);
  });

  it("rejects an oil described as moisturising the hair", () => {
    const v = checkDeterministicRules("The oil moisturises the hair overnight.");
    expect(v.map((x) => x.rule)).toContain("product-as-moisture-source");
  });
});

describe("surface chapter contract", () => {
  it("includes the language chapter on every surface", () => {
    for (const surface of Object.keys(SURFACE_CHAPTERS) as Array<
      keyof typeof SURFACE_CHAPTERS
    >) {
      expect(chaptersForSurface(surface)).toContain(LANGUAGE_CHAPTER);
    }
  });

  it("gives wash day the wash-day and moisture chapters in full", () => {
    expect(chaptersForSurface("wash-day-tip")).toEqual(
      expect.arrayContaining([1, 13, 14]),
    );
    expect(chaptersForSurface("wash-day-steps")).toEqual(
      expect.arrayContaining([1, 13, 14]),
    );
  });

  it("returns chapters in reading order with no duplicates", () => {
    const c = chaptersForSurface("goal-tip");
    expect([...c].sort((a, b) => a - b)).toEqual(c);
    expect(new Set(c).size).toBe(c.length);
  });
});
