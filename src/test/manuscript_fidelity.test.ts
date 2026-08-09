// MANUSCRIPT FIDELITY — regression tests for the two verified errors the app
// produced, plus the surface→chapter contract.
//
// These are the author's own facts. If a test here fails, the app is about to
// tell a member something her book contradicts.

import { describe, expect, it } from "vitest";
import {
  checkDeterministicRules,
} from "../../supabase/functions/_shared/fidelity.ts";
import { checkClarifications } from "../../supabase/functions/_shared/clarifications.ts";

import {
  chaptersForSurface,
  LANGUAGE_CHAPTER,
  SURFACE_CHAPTERS,
} from "../../supabase/functions/_shared/chapter-context.ts";

// AUTHOR CLARIFICATION (2026-08-09) — the area focus is now stated by her and
// overrides the earlier reading of the book: the FIRST cleanse focuses on the
// SCALP with a cleansing/all-purpose shampoo, the SECOND uses a conditioning or
// moisturising shampoo on the HAIR. It is enforced in _shared/clarifications.ts.
describe("two-cleanse protocol", () => {
  const rows = [{ id: "1", topic: "cleansing", position: "", applies_to: [], sort_order: 1 }];

  it("rejects the reversed area focus (first cleanse on the lengths)", () => {
    const v = checkClarifications(
      "Start with your first cleanse focused on the lengths, then move to the scalp.",
      rows,
    );
    expect(v.strip.map((x) => x.rule)).toContain("clarification-cleanse-area-focus");
  });

  it("rejects a conditioning shampoo aimed at the scalp", () => {
    const v = checkClarifications(
      "Use your conditioning shampoo on your scalp for the second cleanse.",
      rows,
    );
    expect(v.strip.map((x) => x.rule)).toContain("clarification-cleanse-area-focus");
  });

  it("accepts her sequence", () => {
    const v = checkClarifications(
      "Your first cleanse focuses on the scalp with an all-purpose shampoo, using the pads of your fingers. The second cleanse uses a conditioning shampoo through your hair.",
      rows,
    );
    expect(v.strip).toHaveLength(0);
    expect(checkDeterministicRules(
      "Your first cleanse focuses on the scalp with an all-purpose shampoo. The second cleanse uses a conditioning shampoo through your hair.",
    ).map((x) => x.rule)).not.toContain("cleanse-order");
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
