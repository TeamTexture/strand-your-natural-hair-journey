// Every member-facing AI generation must route through the ONE shared
// content-integrity guardrail. This test is the structural enforcement: adding
// a text-generating edge function that skips it fails here.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS_DIR = join(process.cwd(), "supabase/functions");

/** Functions that generate member-facing prose. */
const GENERATION_FUNCTIONS = [
  "ingredient-analysis",
  "product-analyse",
  "product-analyse-url",
  "tool-analyse-url",
  "ingredient-profile",
  "ingredient-explainer",
  "brand-product-guidance",
  "nutrition-plan",
  "meal-ideas",
  "goal-tip",
  "wash-day-steps",
  "wash-day-observation",
  "journal-encouragement",
  "heat-treatment-rationale",
  "hair-strand-summary",
  "blood-ai-summary",
];

const read = (rel: string) => readFileSync(join(FUNCTIONS_DIR, rel), "utf8");

describe("content integrity guardrail", () => {
  it("routes every generation function through the shared guardrail", () => {
    for (const fn of GENERATION_FUNCTIONS) {
      const path = join(FUNCTIONS_DIR, fn, "index.ts");
      if (!existsSync(path)) continue;
      const src = read(`${fn}/index.ts`);
      const routed =
        /sanitiseAndLog\s*\(/.test(src) ||
        /checkContentIntegrity|enforceContentIntegrity|enforceAnalysisFailsafes/.test(src);
      expect(routed, `${fn} must route its output through the content-integrity guardrail`).toBe(
        true,
      );
    }
  });

  it("applies the guardrail inside sanitiseAndLog, so no surface can bypass it", () => {
    const src = read("_shared/citation-log.ts");
    expect(src).toContain('from "./content-integrity.ts"');
    expect(src).toContain("applyContentIntegrity");
  });

  it("keeps the three checks in a single module", () => {
    const src = read("_shared/content-integrity.ts");
    for (const dep of ["hair-vocabulary.ts", "ingredient-name-lock.ts", "usage-grounding.ts"]) {
      expect(src).toContain(dep);
    }
    // Rejections are logged in one reviewable place.
    expect(src).toContain("ai_content_rejections");
    // Nulling is the terminal outcome — never a thrown error.
    expect(src).toContain("applyFieldNulls");
  });

  it("does not let analysis functions re-implement the checks locally", () => {
    const dirs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_shared")
      .map((d) => d.name);
    for (const dir of dirs) {
      const path = join(FUNCTIONS_DIR, dir, "index.ts");
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      expect(
        src.includes("validateTerminologyFields("),
        `${dir} must use checkContentIntegrity rather than calling validateTerminologyFields directly`,
      ).toBe(false);
    }
  });
});
