import { describe, it, expect } from "vitest";
import {
  RECENT_EVENT_WINDOW_DAYS,
  hashString,
  responsiveSignatureParts,
  styleSignatureParts,
  type ResponsiveSignals,
} from "@/lib/tipSignature";

const base: ResponsiveSignals = {
  challenges: ["breakage at temples"],
  areasOfConcern: ["Edges"],
  recentWashDay: { id: "w1", date: "2026-08-05" },
  recentAppointment: null,
};

describe("responsive tip signature", () => {
  it("uses a bounded recent-event window", () => {
    expect(RECENT_EVENT_WINDOW_DAYS).toBe(45);
  });

  it("changes when a new wash day is logged", () => {
    const before = hashString(responsiveSignatureParts(base).join("::"));
    const after = hashString(
      responsiveSignatureParts({
        ...base,
        recentWashDay: { id: "w2", date: "2026-08-06" },
      }).join("::"),
    );
    expect(after).not.toBe(before);
  });

  it("changes when an appointment is added", () => {
    const before = hashString(responsiveSignatureParts(base).join("::"));
    const after = hashString(
      responsiveSignatureParts({
        ...base,
        recentAppointment: { id: "a1", date: "2026-08-06" },
      }).join("::"),
    );
    expect(after).not.toBe(before);
  });

  it("changes when challenges or concerns change", () => {
    const before = hashString(responsiveSignatureParts(base).join("::"));
    expect(
      hashString(responsiveSignatureParts({ ...base, challenges: ["dryness"] }).join("::")),
    ).not.toBe(before);
    expect(
      hashString(responsiveSignatureParts({ ...base, areasOfConcern: ["Crown"] }).join("::")),
    ).not.toBe(before);
  });

  it("includes the calendar day so the tip rolls over daily", () => {
    expect(responsiveSignatureParts(base).some((p) => p.startsWith("day:"))).toBe(true);
  });

  it("covers current and planned style with attributes", () => {
    const parts = styleSignatureParts({
      current_hairstyle: "Straight back cornrows",
      current_style_extensions: true,
      current_style_tension: "medium",
      planned_next_style: "Passion / rope twists",
      planned_style_extensions: true,
      planned_style_tension: "low",
    });
    expect(parts).toEqual([
      "cur:Straight back cornrows",
      "curExt:true",
      "curTen:medium",
      "plan:Passion / rope twists",
      "planExt:true",
      "planTen:low",
    ]);
    const changedPlan = styleSignatureParts({
      current_hairstyle: "Straight back cornrows",
      current_style_extensions: true,
      current_style_tension: "medium",
      planned_next_style: "Box braids",
    });
    expect(changedPlan.join("::")).not.toBe(parts.join("::"));
  });
});
