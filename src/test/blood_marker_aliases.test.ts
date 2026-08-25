import { describe, it, expect } from "vitest";
import {
  canonicaliseBloodMarker,
  KNOWN_BLOOD_MARKERS,
} from "../../supabase/functions/_shared/blood-markers.ts";

/**
 * Regression guard for the blood-marker alias matcher. The list lives in a
 * single shared module (supabase/functions/_shared/blood-markers.ts) imported
 * by both the blood-extract edge function and this test — it is NOT copied, so
 * a drift between the function and the test is impossible.
 *
 * The core risk: short aliases like "b12" and "cobalamin" are substrings of
 * the Active B12 aliases ("active b12", "holotranscobalamin"). The matcher must
 * resolve the more specific marker every time, and adding a new marker must
 * never silently flip an existing mapping. Every row of the spec table is
 * asserted in BOTH directions (expected marker IS returned, the confusable
 * counterpart is NOT).
 */

const B12 = "Vitamin B12";
const ACTIVE_B12 = "Active B12";

const CASES: Array<{ reportSays: string; expected: string; confusable: string }> = [
  { reportSays: "Active B12", expected: ACTIVE_B12, confusable: B12 },
  { reportSays: "Active Vitamin B12", expected: ACTIVE_B12, confusable: B12 },
  { reportSays: "Holotranscobalamin", expected: ACTIVE_B12, confusable: B12 },
  { reportSays: "HoloTC", expected: ACTIVE_B12, confusable: B12 },
  { reportSays: "Vitamin B12", expected: B12, confusable: ACTIVE_B12 },
  { reportSays: "Total B12", expected: B12, confusable: ACTIVE_B12 },
  { reportSays: "Cobalamin", expected: B12, confusable: ACTIVE_B12 },
  { reportSays: "B12", expected: B12, confusable: ACTIVE_B12 },
];

describe("blood-extract alias matcher — Active B12 vs total Vitamin B12", () => {
  // Sanity: both markers exist in the shared list so the test is meaningful.
  it("the whitelist defines both Vitamin B12 and Active B12", () => {
    const markers = KNOWN_BLOOD_MARKERS.map((m) => m.marker);
    expect(markers).toContain(B12);
    expect(markers).toContain(ACTIVE_B12);
  });

  for (const { reportSays, expected, confusable } of CASES) {
    it(`"${reportSays}" → ${expected} (not ${confusable})`, () => {
      const res = canonicaliseBloodMarker(reportSays);
      expect(res, `should resolve "${reportSays}"`).not.toBeNull();
      expect(res!.marker).toBe(expected);
      // Both-directions guard: the confusable counterpart must NOT win.
      expect(res!.marker).not.toBe(confusable);
    });

    // Case / padding insensitivity — lab reports vary in casing and spacing.
    it(`"${reportSays}" resolves case-insensitively`, () => {
      const res = canonicaliseBloodMarker(reportSays.toUpperCase());
      expect(res?.marker).toBe(expected);
    });
  }

  it("bare 'b12' still maps to total Vitamin B12 (real data must not be lost)", () => {
    expect(canonicaliseBloodMarker("b12")?.marker).toBe(B12);
  });

  it("an unrecognised marker returns null (kept as an 'other marker')", () => {
    expect(canonicaliseBloodMarker("Vitamin C")).toBeNull();
  });
});
