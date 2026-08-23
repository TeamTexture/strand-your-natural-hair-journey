// Regression: a member who removes her LAST topical sensitivity must see her
// products' normal stored match score again — and a product whose stored score
// is absent must never render as a blank gap on the shelf card.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { scanSensitivities } from "@/lib/sensitivityMatch";

vi.mock("@/hooks/useSensitivities", () => ({
  useSensitivities: () => ({ entriesFor: () => [] }),
}));

import ShelfProductCard from "@/components/product/ShelfProductCard";

const DOVE = [
  "Water",
  "Sodium Laureth Sulfate",
  "Cocamidopropyl Betaine",
  "Fragrance",
];

describe("zero declared sensitivities", () => {
  it("scans to zero hits and leaves the stored score untouched", () => {
    const hits = scanSensitivities(DOVE, [], "topical", { severities: ["avoid"] });
    expect(hits).toEqual([]);
    expect(applySensitivityCeiling(85, hits.length)).toBe(85);
  });

  it("renders the real percentage on the shelf card", () => {
    render(
      <ShelfProductCard
        name="Scalp+Hair Therapy Density & Growth Shampoo"
        matchScore={85}
        ingredients={DOVE}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("85% match")).toBeTruthy();
  });

  it("never leaves the score slot blank when no score is stored", () => {
    render(
      <ShelfProductCard
        name="Scalp+Hair Therapy Density & Growth Shampoo"
        matchScore={null}
        ingredients={DOVE}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("Tap to analyse")).toBeTruthy();
  });
});
