// Guardrail: a product row and its detail page must resolve to the SAME
// score and the SAME stars. Both surfaces go through matchScoreOf/starsFromScore,
// so the only way they can diverge is if a caller reintroduces its own formula.
import { describe, it, expect } from "vitest";
import { matchScoreOf, starsFromScore, starsForItem, normaliseMatchScore } from "@/lib/matchStars";

describe("match score consistency", () => {
  it("list row and detail page agree for the same row", () => {
    const row = { match_score: 62 };
    // Detail page path: analysis score written back to the row, then read.
    const detailScore = normaliseMatchScore(row.match_score);
    expect(detailScore).toBe(matchScoreOf(row));
    expect(starsFromScore(detailScore)).toBe(starsForItem(row));
    expect(starsForItem(row)).toBe(3);
  });

  it("maps 88 to 4.5 stars and 62 to 3 stars", () => {
    expect(starsFromScore(88)).toBe(4.5);
    expect(starsFromScore(62)).toBe(3);
  });

  it("renders no stars when nothing has been analysed", () => {
    expect(starsForItem({ match_score: null })).toBeNull();
    expect(starsFromScore(undefined)).toBeNull();
  });
});
