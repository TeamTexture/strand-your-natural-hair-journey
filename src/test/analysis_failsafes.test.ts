// STRUCTURAL GUARD — the fit-first failsafes may never reach one analysis
// function and miss another again.
//
// 2026-08-28. The closed-vocabulary check, the ingredient-name lockdown and
// fit-first scoring originally lived inside `supabase/functions/ingredient-
// analysis/`, so only that function had them. Members read `product-analyse`,
// so members never saw the fix. This test asserts, from source:
//   1. the modules live in `_shared` (importable by every function),
//   2. every function in FAILSAFE_ANALYSIS_FUNCTIONS routes through the shared
//      entry point, and
//   3. every one of them carries the fit-first cache tag, so the old
//      caution-first payloads cannot be served from cache.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { alignFitLanguage, fitBandForScore } from "@/lib/fitBand";

const FN = "supabase/functions";

/** Mirrors FAILSAFE_ANALYSIS_FUNCTIONS in _shared/analysis-failsafes.ts. */
const FUNCTIONS = [
  "ingredient-analysis",
  "product-analyse",
  "product-analyse-url",
  "tool-analyse-url",
  "ingredient-profile",
  "brand-product-guidance",
];

const read = (p: string) => readFileSync(p, "utf8");

describe("analysis failsafes are shared, not per-function", () => {
  it("the three modules live in _shared", () => {
    for (const m of ["fit-first-score.ts", "hair-vocabulary.ts", "ingredient-name-lock.ts"]) {
      expect(existsSync(`${FN}/_shared/${m}`)).toBe(true);
      expect(existsSync(`${FN}/ingredient-analysis/${m}`)).toBe(false);
    }
  });

  it("the enumeration in the shared module matches this test's list", () => {
    const src = read(`${FN}/_shared/analysis-failsafes.ts`);
    for (const name of FUNCTIONS) expect(src).toContain(`name: "${name}"`);
  });

  it("every enumerated function runs the shared failsafes", () => {
    for (const name of FUNCTIONS) {
      const src = read(`${FN}/${name}/index.ts`);
      // The vocabulary + name-lock checks now live in the single shared
      // content-integrity module (2026-08-28), reached either directly or
      // through enforceAnalysisFailsafes.
      const usesShared = src.includes("enforceAnalysisFailsafes")
        || src.includes("_shared/content-integrity.ts")
        || (src.includes("_shared/hair-vocabulary.ts") && src.includes("_shared/fit-first-score.ts"));
      expect(usesShared, `${name} does not run the shared failsafes`).toBe(true);
    }
  });

  it("every enumerated function carries the fit-first cache tag", () => {
    for (const name of FUNCTIONS) {
      const src = read(`${FN}/${name}/index.ts`);
      // Fit-first landed at v15; later contract bumps (v16…v21) supersede the
      // tag but must never take a surface back below it.
      const tagged = /fit-first-2026-08-28|v15_fit_first|@v(1[5-9]|[2-9]\d)|MODEL_VERSION\s*=\s*["'`]v(1[5-9]|[2-9]\d)/.test(src);
      // brand-product-guidance keys its cache from the client hook.
      if (name === "brand-product-guidance") {
        expect(read("src/hooks/useBrandProductGuidance.ts")).toContain("brand_product_guidance_v15");
        continue;
      }
      expect(tagged, `${name} still serves a pre-fit-first cache key`).toBe(true);
    }
  });


  it("the fit-first prompt rules are attached to the shared score-reason blocks", () => {
    const src = read(`${FN}/_shared/score-reasons.ts`);
    expect(src).toContain("ANALYSIS_FAILSAFE_RULES");
    // Both the product and the tool rule blocks embed them.
    expect(src.split("${ANALYSIS_FAILSAFE_RULES}").length - 1).toBe(2);
  });

  it("the Strand Tip field is on both shared schemas", () => {
    expect(read(`${FN}/_shared/schemas.ts`)).toContain("strand_tip: STRAND_TIP_SCHEMA_PROPERTY");
    expect(read(`${FN}/_shared/tool-schema.ts`)).toContain("strand_tip: STRAND_TIP_SCHEMA_PROPERTY");
  });

  it("the payload we cache is the payload we deliver", () => {
    // A sanitiseAndLog inside the return statement means the cache row was
    // written from the PRE-sanitise payload — the divergence that made
    // ai_summaries hold four score reasons while the member read three.
    for (const name of ["product-analyse", "product-analyse-url", "tool-analyse-url"]) {
      const src = read(`${FN}/${name}/index.ts`);
      expect(
        /JSON\.stringify\(await sanitiseAndLog\(analysis/.test(src)
          || /return await sanitiseAndLog\(analysis/.test(src),
        `${name} still sanitises after caching`,
      ).toBe(false);
    }
  });
});

describe("fit band keeps prose and label in step", () => {
  it("bands mirror the star verdicts", () => {
    expect(fitBandForScore(95)).toBe("excellent");
    expect(fitBandForScore(72)).toBe("good");
    expect(fitBandForScore(55)).toBe("mixed");
    expect(fitBandForScore(35)).toBe("poor");
    expect(fitBandForScore(10)).toBe("avoid");
    expect(fitBandForScore(null)).toBeNull();
  });

  it("rewrites prose that contradicts the score band", () => {
    expect(alignFitLanguage("This is a mixed fit for your hair.", 72))
      .toBe("This is a good fit for your hair.");
    expect(alignFitLanguage("A good match for your porosity.", 30))
      .toBe("not an ideal fit for your porosity.");
  });

  it("leaves agreeing prose untouched", () => {
    const text = "A good fit for your porosity.";
    expect(alignFitLanguage(text, 78)).toBe(text);
    expect(alignFitLanguage("A mixed fit while your scalp settles.", 55))
      .toBe("A mixed fit while your scalp settles.");
  });
});
