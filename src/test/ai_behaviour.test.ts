import { describe, it, expect } from "vitest";
import {
  deriveBehaviour,
  deriveBreakageSeverity,
  deriveRecentProductsUsed,
  mergeProfessionalRecommendations,
} from "@/lib/aiBehaviour";

const NOW = new Date("2026-09-11T09:00:00Z");

const day = (offsetDays: number) =>
  new Date(NOW.getTime() - offsetDays * 86_400_000).toISOString().slice(0, 10);

describe("deriveBehaviour", () => {
  it("returns undefined with no logs (never a zeroed slice)", () => {
    expect(deriveBehaviour([], NOW)).toBeUndefined();
  });

  it("reads a weekly, very regular cadence off evenly spaced logs", () => {
    const logs = [0, 7, 14, 21, 28].map((d) => ({ id: `w${d}`, wash_date: day(d) }));
    const b = deriveBehaviour(logs, NOW)!;
    expect(b.wash_frequency).toBe("weekly");
    expect(b.wash_consistency).toBe("very regular");
    expect(b.wash_count_30d).toBe(5);
  });

  it("reads a sporadic cadence off uneven gaps", () => {
    const logs = [0, 3, 40, 44, 90].map((d) => ({ id: `w${d}`, wash_date: day(d) }));
    const b = deriveBehaviour(logs, NOW)!;
    expect(b.wash_consistency).toBe("sporadic");
  });

  it("reports never / 100% air dry when no thermal styling is logged", () => {
    const logs = [0, 7, 14].map((d) => ({ id: `w${d}`, wash_date: day(d) }));
    const b = deriveBehaviour(logs, NOW)!;
    expect(b.heat_frequency).toBe("never");
    expect(b.air_dry_percentage).toBe(100);
  });

  it("counts thermal styling heat and lowers the air-dry share", () => {
    const logs = [0, 7, 14, 21].map((d, i) => ({
      id: `w${d}`,
      wash_date: day(d),
      styling: i < 2 ? { heat: { blow_dry: true } } : null,
    }));
    const b = deriveBehaviour(logs, NOW)!;
    expect(b.air_dry_percentage).toBe(50);
    expect(b.heat_frequency).toBe("weekly");
  });
});

describe("deriveBreakageSeverity", () => {
  it("maps her own answers to a band", () => {
    expect(deriveBreakageSeverity({})).toBeUndefined();
    expect(deriveBreakageSeverity({ None: 3 })).toBe("none");
    expect(deriveBreakageSeverity({ "A little": 3 })).toBe("minimal");
    expect(deriveBreakageSeverity({ Some: 3 })).toBe("moderate");
    expect(deriveBreakageSeverity({ "A lot": 3 })).toBe("high");
  });

  it("ignores answers it does not recognise instead of guessing", () => {
    expect(deriveBreakageSeverity({ "didn't check": 2 })).toBeUndefined();
  });
});

describe("deriveRecentProductsUsed", () => {
  it("links wash product ids to names with their latest use", () => {
    const used = deriveRecentProductsUsed(
      [
        { wash_date: day(0), product_ids: ["p1"] },
        { wash_date: day(9), product_ids: ["p1", "p2"] },
      ],
      [
        { id: "p1", name: "Curl Cream", brand: "TT", category: "Leave-in" },
        { id: "p2", name: "Clay Wash", brand: "TT", category: "Cleanser" },
      ],
    );
    expect(used.map((p) => p.name)).toEqual(["Curl Cream", "Clay Wash"]);
    expect(used[0].last_used).toBe(day(0));
  });

  it("drops ids with no matching saved product", () => {
    expect(
      deriveRecentProductsUsed([{ wash_date: day(0), product_ids: ["ghost"] }], []),
    ).toEqual([]);
  });
});

describe("mergeProfessionalRecommendations", () => {
  it("returns undefined when nothing was written down", () => {
    expect(mergeProfessionalRecommendations(null, [])).toBeUndefined();
    expect(
      mergeProfessionalRecommendations("", [{ notes: "", outcome_notes: null }]),
    ).toBeUndefined();
  });

  it("merges consultation notes with appointment notes", () => {
    const out = mergeProfessionalRecommendations("Reduce tension at the edges", [
      {
        appointment_date: "2026-08-01",
        professional_name: "Hair By Lauralyn",
        notes: "Weekly scalp cleanse",
        outcome_notes: "Retest ferritin",
      },
    ])!;
    expect(out).toContain("Reduce tension at the edges");
    expect(out).toContain("Hair By Lauralyn");
    expect(out).toContain("Weekly scalp cleanse — Retest ferritin");
  });
});
