// Guardrail: ONE score per product. Every surface that shows a hair-match
// score — the product card, the detail page, the passport a professional
// reads, the PDFs and the aiContext payload sent to every AI call — must
// resolve the SAME number and the SAME stars from the same user_products row.
// The only sanctioned path is matchScoreOf / starsForItem in src/lib/matchStars.
import { describe, it, expect } from "vitest";
import {
  matchScoreOf,
  starsFromScore,
  starsForItem,
  normaliseMatchScore,
  verdictForStars,
  verdictForScore,
  isLowMatch,
  isScoreStale,
} from "@/lib/matchStars";

/** A user_products row as every surface receives it. */
const row = { match_score: 62, match_score_computed_at: "2026-08-01T00:00:00Z" };

describe("one score per product, across every surface", () => {
  it("card, detail page, passport, PDFs and aiContext all resolve the same score", () => {
    // Product card (Products.tsx) and MatchStars item form.
    const card = matchScoreOf(row);
    // Detail page (IngredientDetail displayScore) — column first, always.
    const detail = matchScoreOf(row) ?? normaliseMatchScore(undefined);
    // Passport (PassportView) and both PDFs use matchScoreOf on the same row.
    const passport = matchScoreOf(row);
    const pdf = matchScoreOf(row);
    // aiContext selects the match_score column verbatim.
    const aiContext = normaliseMatchScore(row.match_score);

    expect(new Set([card, detail, passport, pdf, aiContext]).size).toBe(1);
    expect(card).toBe(62);
  });

  it("stars agree everywhere and never contradict the verdict label", () => {
    const stars = starsForItem(row);
    expect(stars).toBe(3);
    expect(starsFromScore(matchScoreOf(row))).toBe(stars);
    expect(verdictForStars(stars!)).toBe(verdictForScore(row.match_score));
    // "Excellent match" must never sit next to 3 stars.
    expect(verdictForStars(stars!)).toBe("Use with care");
    expect(verdictForScore(88)).toBe("Excellent match for your hair");
    expect(starsFromScore(88)).toBe(4.5);
  });

  it("no score means no stars and no verdict", () => {
    expect(starsForItem({ match_score: null })).toBeNull();
    expect(starsFromScore(undefined)).toBeNull();
    expect(verdictForScore(null)).toBeNull();
  });

  it("flags a genuinely low match for the professional snapshot", () => {
    expect(isLowMatch({ match_score: 22 })).toBe(true);
    expect(isLowMatch({ match_score: 62 })).toBe(false);
    // The old bug treated the 0-100 score as a 5-point scale (score <= 2).
    expect(isLowMatch({ match_score: 88 })).toBe(false);
  });
});

describe("staleness after a hair-profile change", () => {
  it("is stale when the hair profile was edited after the score was computed", () => {
    expect(isScoreStale(row, "2026-08-02T00:00:00Z")).toBe(true);
  });
  it("is fresh when the score was computed after the last profile edit", () => {
    expect(isScoreStale(row, "2026-07-01T00:00:00Z")).toBe(false);
  });
  it("is stale when there is no score or no computed-at stamp", () => {
    expect(isScoreStale({ match_score: null }, "2026-07-01T00:00:00Z")).toBe(true);
    expect(isScoreStale({ match_score: 62 }, "2026-07-01T00:00:00Z")).toBe(true);
  });
});
