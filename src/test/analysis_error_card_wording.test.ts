// The failure card on the product page is written for a member, not a
// developer: no status codes, no error class names, no "non-2xx". It keeps its
// heading and its Retry button, and adds the server's own sentence when there
// is one.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/IngredientDetail.tsx", "utf8");
const anchor = page.indexOf("memberFacingAiError(error)");
const cardBlock = page.slice(
  page.lastIndexOf("<SurfaceCard", anchor),
  page.indexOf("</SurfaceCard>", anchor),
);

describe("product page failure card", () => {
  it("never shows machine wording to the member", () => {
    for (const banned of ["non-2xx", "FunctionsHttpError", "status code"]) {
      expect(cardBlock).not.toContain(banned);
    }
  });

  it("keeps the heading, the second line and the Retry button", () => {
    expect(cardBlock).toContain("Could not analyse this product.");
    expect(cardBlock).toContain("memberFacingAiError(error)");
    expect(cardBlock).toContain("Retry");
    expect(cardBlock).toContain('runAnalysis("member_requested", true)');
  });
});

describe("row rescue is bounded", () => {
  const fn = readFileSync("supabase/functions/ingredient-analysis/index.ts", "utf8");
  const start = fn.indexOf("BOUNDED (2026-09-07)");
  const rescue = fn.slice(start, fn.indexOf("score_reasons_row_rescue", start) + 400);

  it("re-checks every bullet in ONE sanitiseAndLog pass, never one per row", () => {
    expect(rescue).toContain("const checkedBag");
    // Exactly one sanitiseAndLog call inside the rescue block.
    expect(rescue.match(/sanitiseAndLog\(/g)?.length).toBe(1);
    expect(rescue).not.toMatch(/for \(const row of preReasons\)/);
  });
});
