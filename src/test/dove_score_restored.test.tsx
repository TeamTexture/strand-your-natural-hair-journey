// Pins the restored score for the exact row Paige reported blank:
// user_products 56f565c9… "Dove Scalp+Hair Therapy Density & Growth Shampoo",
// match_score = 88. Both surfaces must show 88 when she has no sulphate
// sensitivity declared, and both must collapse to the same ceiling when she does.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { scanSensitivities } from "@/lib/sensitivityMatch";

vi.mock("@/hooks/useSensitivities", () => ({
  useSensitivities: () => ({ entriesFor: () => [] }),
}));

import ShelfProductCard from "@/components/product/ShelfProductCard";

const STORED = 88;

// Real stored INCI list for the row (abridged to the sensitivity-relevant part).
const DOVE_INCI = [
  "Aqua",
  "Sodium Laureth Sulfate",
  "Cocamidopropyl Betaine",
  "Glycerin",
  "Parfum",
  "Citric Acid",
];

const SULPHATE_SENSITIVITY = [
  { code: "sulphates", label: "Sulphates (SLS/SLES)", severity: "avoid" } as never,
];


describe("Dove shampoo score restored (row 56f565c9…)", () => {
  it("shelf card shows the stored 88% when no sensitivity is declared", () => {
    render(
      <ShelfProductCard
        name="Scalp+Hair Therapy Density & Growth Shampoo"
        matchScore={STORED}
        ingredients={DOVE_INCI}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("88% match")).toBeTruthy();
    expect(screen.queryByText("Tap to analyse")).toBeNull();
  });

  it("detail page derives the same 88 from the same stored value", () => {
    const hits = scanSensitivities(DOVE_INCI, [], "topical", { severities: ["avoid"] });
    expect(hits).toEqual([]);
    expect(applySensitivityCeiling(STORED, hits.length)).toBe(STORED);
  });

  it("still collapses to the ceiling if she re-declares the sulphate sensitivity", () => {
    const hits = scanSensitivities(DOVE_INCI, SULPHATE_SENSITIVITY, "topical", {
      severities: ["avoid"],
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(applySensitivityCeiling(STORED, hits.length)).toBeLessThan(STORED);
  });
});
