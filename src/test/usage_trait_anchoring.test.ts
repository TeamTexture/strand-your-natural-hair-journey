import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const SRC = "supabase/functions/_shared/usage-grounding.ts";

/**
 * Guard for the anchoring correction (2026-08-28): an illustrative example that
 * named "high density hair" made the models reach for density on products where
 * density changes nothing. The prompt must select the trait by the product's
 * mechanism and must never carry a single default trait.
 */
describe("how-to-use personalisation — no default profile trait", () => {
  const src = readFileSync(SRC, "utf8");

  it("instructs the model to select the trait by mechanism", () => {
    expect(src).toMatch(/SELECT THE TRAIT BY MECHANISM/);
    expect(src).toMatch(/which stored trait, if it were different/i);
  });

  it("carries an explicit anti-anchoring rule naming the failure mode", () => {
    expect(src).toMatch(/ANTI-ANCHORING RULE/);
    expect(src).toMatch(/Never default to the same profile trait across products/i);
    expect(src).toMatch(/Density is NOT the house trait/i);
    expect(src).toMatch(/never because it appears in an example/i);
  });

  it("no longer uses the density sentence as the single target example", () => {
    // The old block held exactly one worked example, on density. Any density
    // example now must not be the only one.
    const examples = src.match(/^"[A-Z].*"$/gm) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(2);
    const densityExamples = examples.filter((e) => /density/i.test(e));
    expect(densityExamples.length).toBe(0);
  });

  it("offers mechanism→trait routing across several product kinds", () => {
    for (const kind of ["reach the scalp", "Leave-in", "Heat or styling", "Protein", "Cleanser"]) {
      expect(src).toContain(kind);
    }
    expect(src).toMatch(/never a lookup table/i);
  });
});

describe("trait detection feeds the anti-anchoring signal", () => {
  it("detects which trait a piece of copy actually named", async () => {
    const { detectNamedTraits, recentTraitUsage } = await import(
      /* @vite-ignore */ "../../supabase/functions/_shared/usage-grounding.ts"
    );
    expect(detectNamedTraits("As you have high density hair, separate your sections")).toContain(
      "density",
    );
    expect(detectNamedTraits("Because your hair dries out quickly, work it through")).toContain(
      "porosity",
    );
    expect(detectNamedTraits("Because your strands are fine, keep this to your ends")).toContain(
      "strand diameter",
    );
    expect(detectNamedTraits(null)).toEqual([]);

    // Repeated density across her shelf surfaces as the most-used trait.
    const used = recentTraitUsage([
      "as you have high density hair, ...",
      "with your high density hair, ...",
      "your hair dries out quickly, ...",
    ]);
    expect(used[0]).toBe("density");
    expect(used).toContain("porosity");
  });
});
