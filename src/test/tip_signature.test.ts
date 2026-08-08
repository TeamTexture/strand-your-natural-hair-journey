import { describe, it, expect } from "vitest";
import {
  RECENT_EVENT_WINDOW_DAYS,
  hashString,
  responsiveSignatureParts,
  styleSignatureParts,
  type ResponsiveSignals,
  strandTipSignatureParts,
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

describe("strandTipSignatureParts (home STRAND tip — static)", () => {
  const style = { current_hairstyle: "cornrows", planned_next_style: "twists" };
  const goal = { id: "g1", title: "Length", target_text: "4 inches", target_date: "2026-12-01" };

  it("depends only on current style, planned style and the goal", () => {
    expect(strandTipSignatureParts(style, goal)).toEqual([
      "cur:cornrows",
      "plan:twists",
      "goal:g1",
      "goalTitle:Length",
      "goalTarget:4 inches",
      "goalDate:2026-12-01",
    ]);
  });

  it("carries no calendar day and ignores wash days, appointments, challenges and concerns", () => {
    const parts = strandTipSignatureParts(
      { ...style, current_style_tension: "tight", areas_of_concern: ["breakage"] },
      goal,
    ).join("::");
    expect(parts).not.toMatch(/day:/);
    expect(parts).not.toMatch(/wash|appt|challenge|concern|tension/i);
  });

  it("changes when planned_next_style changes, and only then", () => {
    const before = strandTipSignatureParts(style, goal).join("::");
    const same = strandTipSignatureParts({ ...style }, { ...goal }).join("::");
    const after = strandTipSignatureParts({ ...style, planned_next_style: "bantu knots" }, goal).join("::");
    expect(same).toBe(before);
    expect(after).not.toBe(before);
  });
});
