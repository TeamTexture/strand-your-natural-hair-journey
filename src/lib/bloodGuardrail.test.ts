import { describe, expect, it } from "vitest";
import { scrubBloodClaims, sentenceAllowed } from "@/lib/bloodGuardrail";

describe("blood guardrail", () => {
  it("keeps a plain out-of-range blood fact with a GP recommendation", () => {
    const text =
      "Your B12 is 83 pmol/L, which is below the typical range of 145-569 pmol/L. Worth discussing with your GP.";
    expect(scrubBloodClaims(text)).toBe(text);
  });

  it("drops a fabricated marker→hair bridge but keeps the hair guidance", () => {
    const out = scrubBloodClaims(
      "Low LH and FSH require extra care around your hairline, so keep your cornrows tension-free. Rinse with cool water to close the cuticle.",
    );
    expect(out).not.toMatch(/LH/);
    expect(out).toMatch(/cool water/);
  });

  it("drops an invented physiological mechanism", () => {
    const out = scrubBloodClaims(
      "Your B12 reads 83 pmol/L, which is low and can slow cell division at the follicle, affecting how your TWA retains density.",
    );
    expect(out).not.toMatch(/cell division/);
  });

  it("keeps hair guidance sitting beside a blood fact with no causal connector", () => {
    const text =
      "Your ferritin is 18 ug/L, below the typical range. Take that to your GP. Keep your wash day gentle and detangle in sections.";
    expect(scrubBloodClaims(text)).toBe(text);
  });

  it("does not suppress blood-referencing sentences generally", () => {
    expect(sentenceAllowed("Your vitamin D is 42 nmol/L, inside the typical range.")).toBe(true);
    expect(sentenceAllowed("Your TSH sits within range; no action needed.")).toBe(true);
  });
});
