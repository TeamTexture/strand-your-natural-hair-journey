import { describe, it, expect } from "vitest";
import { scanSensitivities } from "@/lib/sensitivityMatch";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { starsFromScore, formatStars, verdictForStars, scoreTone } from "@/lib/matchStars";

const inci = ["water (aqua/eau)","sodium c14-16 olefin sulfonate","glycerin","fragrance (parfum)","limonene","coumarin","linalool"];
const entries = [{ id: "1", label: "Fragrance/parfum", severity: "avoid", scope: "topical" } as any];

describe("CANTU Ultra Moisture Nourishing on Paige's account", () => {
  it("collapses the detail-page score, stars and verdict", () => {
    const hits = scanSensitivities(inci, entries, "topical", { severities: ["avoid"] });
    expect(hits.length).toBe(1);
    const stored = 85;
    const shown = applySensitivityCeiling(stored, hits.length)!;
    const stars = starsFromScore(shown)!;
    console.log({ stored, shown, stars: formatStars(stars), tone: scoreTone(shown), oldVerdict: verdictForStars(starsFromScore(stored)!), newVerdict: verdictForStars(stars) });
    expect(shown).toBe(18);
    expect(verdictForStars(stars)).not.toMatch(/Excellent/);
  });
});
