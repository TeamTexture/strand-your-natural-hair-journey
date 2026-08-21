// The shelf allergen strip is deterministic and non-AI: a stored INCI array
// plus the member's decrypted topical avoid list is all it needs.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { scanSensitivities } from "@/lib/sensitivityMatch";
import type { SensitivityEntry } from "@/lib/sensitivityVocab";

const FRAGRANCE: SensitivityEntry = {
  code: "fragrance",
  label: "Fragrance / parfum",
  severity: "avoid",
};

vi.mock("@/hooks/useSensitivities", () => ({
  useSensitivities: () => ({
    entriesFor: () => [
      { code: "fragrance", label: "Fragrance / parfum", severity: "avoid" },
    ],
  }),
}));

import SensitivityShelfAlert from "@/components/sensitivity/SensitivityShelfAlert";

// Real INCI tails from Paige's shelf.
const DOVE = ["Aqua", "Glycerin", "Cetearyl Alcohol", "Parfum", "Citric Acid"];
const CANTU = ["Water", "Shea Butter", "Fragrance", "Tocopherol"];
const CLEAN = ["Aqua", "Glycerin", "Panthenol"];

describe("shelf sensitivity alert", () => {
  it("matches an exact INCI term", () => {
    expect(scanSensitivities(CANTU, [FRAGRANCE], "topical")[0].term).toBe("fragrance");
  });

  it("matches via the alias table (parfum)", () => {
    expect(scanSensitivities(DOVE, [FRAGRANCE], "topical")[0].term).toBe("parfum");
  });

  it("renders the strip with the sensitivity named", () => {
    render(<SensitivityShelfAlert ingredients={DOVE} />);
    expect(screen.getByRole("alert").textContent).toContain("Fragrance / parfum");
  });

  it("renders nothing for a clear product", () => {
    const { container } = render(<SensitivityShelfAlert ingredients={CLEAN} />);
    expect(container.firstChild).toBeNull();
  });
});
