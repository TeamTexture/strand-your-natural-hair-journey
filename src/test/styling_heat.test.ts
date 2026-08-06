import { describe, it, expect } from "vitest";
import {
  stylingHeatOf,
  describeStylingHeat,
  blowDryCountLast7Days,
} from "@/lib/stylingHeat";

describe("styling heat", () => {
  it("reads nested styling.heat with snake_case keys", () => {
    const heat = stylingHeatOf({
      style: ["Locs"],
      heat: { used: true, methods: ["blow_dry", "flat_iron"], level: "high", protectant_used: true },
    });
    expect(heat).toEqual({
      used: true,
      methods: ["blow_dry", "flat_iron"],
      level: "high",
      protectant_used: true,
    });
  });

  it("returns null when nothing was captured", () => {
    expect(stylingHeatOf(null)).toBeNull();
    expect(stylingHeatOf({ style: ["Locs"] })).toBeNull();
    expect(describeStylingHeat(null)).toBeNull();
  });

  it("never reads conditioning heat fields", () => {
    // heat_treatment / steps[].heat live outside `styling` entirely.
    expect(stylingHeatOf({ heat_treatment: { used: true, duration_min: 30 } })).toBeNull();
  });

  it("counts blow dries in the trailing 7 days only", () => {
    const now = new Date("2026-08-06T12:00:00Z");
    const rows = [
      { wash_date: "2026-08-06", styling: { heat: { used: true, methods: ["blow_dry"] } } },
      { wash_date: "2026-08-02", styling: { heat: { used: true, methods: ["flat_iron"] } } },
      { wash_date: "2026-08-01", styling: { heat: { used: true, methods: ["blow_dry"] } } },
      { wash_date: "2026-07-20", styling: { heat: { used: true, methods: ["blow_dry"] } } },
      { wash_date: "2026-08-03", heat_treatment: { used: true } },
    ];
    expect(blowDryCountLast7Days(rows, now)).toBe(2);
  });
});
