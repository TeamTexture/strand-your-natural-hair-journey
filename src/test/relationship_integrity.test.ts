// RELATIONSHIP INTEGRITY — the third guardrail. Invented relationships between
// two real, approved nouns must be rejected even though every word passes the
// closed-vocabulary and ingredient-name checks.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPROVED_RELATIONSHIPS,
  CONCEPTS,
  FORBIDDEN_RELATIONSHIPS,
  validateRelationships,
} from "../../supabase/functions/_shared/relationships.ts";
import { checkContentIntegrity } from "../../supabase/functions/_shared/content-integrity.ts";

const rules = (text: string) =>
  validateRelationships("ai_summary", text).map((v) => v.relationshipId);

describe("forbidden relationships", () => {
  it("rejects the reported error: porosity connected to oil loss", () => {
    expect(rules("Your scalp loses oil fast because you have high porosity hair."))
      .toContain("porosity-oil-crossing");
  });

  it("rejects sebum production attributed to a strand property", () => {
    expect(rules("Low porosity reduces your sebum production."))
      .toContain("sebum-porosity-production");
  });

  it("rejects a strand property explaining a scalp condition", () => {
    expect(rules("High porosity causes your dandruff."))
      .toContain("porosity-scalp-crossing");
  });

  it("rejects density connected to moisture", () => {
    expect(rules("Because your density is low, your hair holds less moisture."))
      .toContain("density-moisture-crossing");
  });

  it("rejects an oil described as moisturising", () => {
    expect(rules("This shea butter deeply moisturises the hair."))
      .toContain("oil-as-moisturiser");
    expect(rules("The oil hydrates your strands overnight."))
      .toContain("oil-as-moisturiser");
  });

  it("rejects humectant/emollient role inversion", () => {
    expect(rules("Glycerine seals moisture into the strand."))
      .toContain("humectant-role-inversion");
    expect(rules("Shea butter attracts moisture from the air."))
      .toContain("emollient-role-inversion");
  });

  it("rejects topical growth stimulation and follicle reach", () => {
    expect(rules("This serum stimulates growth at the root."))
      .toContain("topical-growth-stimulation");
    expect(rules("The oil penetrates the follicle to feed it."))
      .toContain("topical-growth-stimulation");
  });

  it("allows a genuinely medicinal active to act at the root", () => {
    expect(rules("Minoxidil is a medicinal active that stimulates growth at the follicle."))
      .not.toContain("topical-growth-stimulation");
  });

  it("rejects default-negative framing of silicones and preservatives", () => {
    expect(rules("Silicones are damaging and should be avoided."))
      .toContain("silicone-negative-default");
    expect(rules("Preservative-free is better for your hair."))
      .toContain("preservative-negative-default");
  });
});

describe("approved relationships pass untouched", () => {
  const approved = [
    "High porosity means your cuticle takes water in easily and loses it just as fast.",
    "This oil slows how quickly that water leaves the strand.",
    "Glycerine attracts moisture from the atmosphere into your hair.",
    "Shea butter fills cuticle gaps and holds on to the moisture already there.",
    "Silicones smooth dry, porous hair and simply need proper cleansing to avoid build-up.",
    "Preservatives keep this formula safe at the concentrations used.",
    "Too much oil on your scalp can suppress its own sebum production.",
    "Your density is the number of strands per square inch of your scalp.",
    "Elasticity tells you about your protein and moisture balance.",
  ];
  for (const text of approved) {
    it(`accepts: ${text.slice(0, 48)}…`, () => {
      expect(validateRelationships("ai_summary", text)).toHaveLength(0);
    });
  }
});

describe("wiring and ground-truth library", () => {
  it("runs inside the single shared guardrail as its own check", () => {
    const result = checkContentIntegrity({
      functionName: "test",
      fields: [{ field: "ai_summary", text: "Your scalp loses oil fast because you have high porosity hair." }],
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.check === "relationship_integrity")).toBe(true);
  });

  it("does not regress the other two lockdowns", () => {
    const src = readFileSync(
      join(process.cwd(), "supabase/functions/_shared/content-integrity.ts"),
      "utf8",
    );
    for (const dep of ["hair-vocabulary.ts", "ingredient-name-lock.ts", "usage-grounding.ts", "relationships.ts"]) {
      expect(src).toContain(dep);
    }
    expect(src).toContain("applyFieldNulls");
  });

  it("tags every relationship with a manuscript source", () => {
    for (const r of [...APPROVED_RELATIONSHIPS, ...FORBIDDEN_RELATIONSHIPS]) {
      expect(r.source).toMatch(/How To Love Your Afro/);
    }
    for (const c of CONCEPTS) expect(c.source).toMatch(/How To Love Your Afro/);
  });
});
