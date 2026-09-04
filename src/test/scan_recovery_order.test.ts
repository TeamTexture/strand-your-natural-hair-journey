import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * NEVER LOSE FINISHED WORK — ordering invariant.
 *
 * A worker killed in the post-guardrail tail (cache upsert, advice ledger,
 * timing write, QA trail) must not be able to discard a finished analysis.
 * The recovery persist therefore has to be the FIRST awaited server work after
 * the guarded payload exists.
 */
const files = [
  "supabase/functions/product-analyse/index.ts",
  "supabase/functions/product-analyse-url/index.ts",
];

describe("scan recovery is persisted before any other tail work", () => {
  for (const f of files) {
    it(`${f} saves recovery before the cache upsert and timings`, () => {
      const src = readFileSync(f, "utf8");
      const save = src.indexOf("saveScanRecovery({");
      expect(save).toBeGreaterThan(0);
      // exactly one persist call site
      expect(src.split("saveScanRecovery({").length - 1).toBe(1);
      const cache = src.indexOf('.from("ai_summaries")', save > 0 ? 0 : 0);
      const timing = src.indexOf("logScanTiming({");
      expect(timing).toBeGreaterThan(save);
      // the cache upsert block that follows the analysis must come after
      const upsert = src.lastIndexOf('kind: cacheKind');
      expect(upsert).toBeGreaterThan(save);
      expect(cache).toBeGreaterThan(0);
    });
  }

  it("photo scan does not await the manuscript evidence gather before the model call", () => {
    const src = readFileSync("supabase/functions/product-analyse/index.ts", "utf8");
    expect(src).not.toContain("      evidencePromise,\n");
    expect(src).toContain("await evidencePromise;");
  });
});
