// Layer 1 of the daily-log guidance is a LOOKUP: it must never invent copy, and
// it must never surface a caution on a save confirmation.
import { describe, expect, it } from "vitest";
import { buildSaveGuidance, traitPhrases } from "@/lib/dailyLogGuidance";
import { buildDailyWeekSummary } from "@/lib/dailyWeekSummary";
import type { DailyHairEntry } from "@/hooks/useDailyHairEntries";
import type { UserProduct } from "@/hooks/useUserProducts";

const hair = { porosity: "High", density: "Medium", areas_of_concern: ["edges"] };

describe("buildSaveGuidance", () => {
  it("returns null when the product has no stored analysis", () => {
    expect(buildSaveGuidance({}, hair)).toBeNull();
    expect(buildSaveGuidance(null, hair)).toBeNull();
  });

  it("builds copy from stored plus drivers and prefers one naming her traits", () => {
    const g = buildSaveGuidance(
      {
        score_reasons: [
          { direction: "plus", factor: "Glycerin", reason: "draws water in from the air" },
          {
            direction: "plus",
            factor: "Shea butter",
            reason: "slows water loss from high porosity strands",
          },
        ],
      },
      hair,
    );
    expect(g).not.toBeNull();
    expect(g!.text.startsWith("Slows water loss")).toBe(true);
    expect(g!.traits).toContain("high porosity");
  });

  it("never surfaces a caution driver on a save", () => {
    const g = buildSaveGuidance(
      { score_reasons: [{ direction: "minus", factor: "Denatured alcohol", reason: "dries the strand" }] },
      hair,
    );
    expect(g).toBeNull();
  });

  it("falls back to the stored summary's first sentence only", () => {
    const g = buildSaveGuidance(
      { ai_summary: "A rich cream. It also contains fragrance." },
      hair,
    );
    expect(g!.text).toBe("A rich cream.");
  });

  it("humanises recorded characteristics", () => {
    expect(traitPhrases(hair)).toEqual(["high porosity", "medium density", "edges"]);
  });
});

const entry = (date: string, ids: string[]): DailyHairEntry => ({
  id: `${date}-${ids.join("")}`,
  entry_date: date,
  entry_at: `${date}T09:00:00.000Z`,
  product_ids: ids,
  note: null,
  voice_path: null,
  created_at: `${date}T09:00:00.000Z`,
});

const product = (id: string, name: string): UserProduct =>
  ({ id, name, brand: null, category: "leave-in" } as unknown as UserProduct);

describe("buildDailyWeekSummary", () => {
  it("is null below two entries — one log is not a pattern", () => {
    expect(buildDailyWeekSummary([entry("2026-09-01", ["a"])], [], null, "2026-09-01")).toBeNull();
  });

  it("counts days, streaks and applications since the last wash", () => {
    const s = buildDailyWeekSummary(
      [entry("2026-09-01", ["a"]), entry("2026-09-02", ["a", "b"]), entry("2026-09-04", ["a"])],
      [product("a", "Leave-in"), product("b", "Oil")],
      "2026-09-02",
      "2026-09-04",
    );
    expect(s).not.toBeNull();
    expect(s!.entries).toBe(3);
    expect(s!.daysLogged).toBe(3);
    expect(s!.longestStreak).toBe(2);
    expect(s!.applicationsSinceWash).toBe(3);
    expect(s!.daysSinceWash).toBe(2);
    expect(s!.products[0]).toMatchObject({ name: "Leave-in", times: 3, days: 3 });
  });
});
