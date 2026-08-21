// The displayed match percentage must collapse the instant a declared topical
// sensitivity matches, graduated by how many matched. No AI, no network.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { applySensitivityCeiling, sensitivityCeiling } from "@/lib/sensitivityCeiling";

vi.mock("@/hooks/useSensitivities", () => ({
  useSensitivities: () => ({
    entriesFor: () => [
      { code: "fragrance", label: "Fragrance / parfum", severity: "avoid" },
      { code: "sulphates", label: "Sulphates", severity: "avoid" },
      { code: "drying_alcohols", label: "Drying alcohols", severity: "avoid" },
    ],
  }),
}));

import ShelfProductCard from "@/components/product/ShelfProductCard";

// Real INCI tails.
const CANTU = ["Water", "Shea Butter", "Fragrance", "Tocopherol"]; // 1 match
const TWO = ["Aqua", "Sodium Lauryl Sulfate", "Parfum"]; // 2 matches
const THREE = ["Aqua", "Sodium Laureth Sulfate", "Parfum", "Alcohol Denat."]; // 3 matches
const CLEAN = ["Aqua", "Glycerin", "Panthenol"];

describe("graduated sensitivity ceiling", () => {
  it("gets steeper with each matched sensitivity", () => {
    expect(sensitivityCeiling(0)).toBeNull();
    expect(sensitivityCeiling(1)).toBe(18);
    expect(sensitivityCeiling(2)).toBe(8);
    expect(sensitivityCeiling(3)).toBe(3);
    expect(sensitivityCeiling(9)).toBe(3);
  });

  it("is a ceiling, never a floor", () => {
    expect(applySensitivityCeiling(85, 1)).toBe(18);
    expect(applySensitivityCeiling(5, 1)).toBe(5);
    expect(applySensitivityCeiling(85, 0)).toBe(85);
  });

  const scoreOn = (ingredients: string[]) => {
    const { unmount } = render(
      <ShelfProductCard name="CANTU Ultra Moisture Nourishing" matchScore={85} ingredients={ingredients} />,
    );
    const text = screen.getByText(/% match/).textContent ?? "";
    unmount();
    return Number(text.replace(/[^0-9]/g, ""));
  };

  it("overrides the stored 85% on the card", () => {
    expect(scoreOn(CLEAN)).toBe(85);
    expect(scoreOn(CANTU)).toBe(18);
    expect(scoreOn(TWO)).toBe(8);
    expect(scoreOn(THREE)).toBe(3);
  });
});
