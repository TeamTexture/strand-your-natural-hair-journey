// CONDITIONAL WEB SEARCH (2026-09-01)
//
// Every scan used to spend its search budget by default, which cost ~8-12s of
// wall clock per round on packs the member was literally holding. Search now
// has to be earned: the photo read runs with no tool attached, and one
// searching pass is granted only when the payload shows the label could not be
// resolved. Verification strength is unchanged — the gate decides whether a
// search happens, never whether a claim gets checked.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  decidePhotoSearch,
  decideUrlSearch,
  needsSearchRetry,
  pageLikelyHasInci,
  sourcesCoverProduct,
} from "../../supabase/functions/_shared/search-gate.ts";

const readable = {
  brand: "Nylah",
  productName: "Marula & Baobab Nourishing Serum",
  product_name: "Marula & Baobab Nourishing Serum",
  ingredients: ["Aqua", "Glycerin", "Sclerocarya Birrea Seed Oil", "Panthenol"],
  ai_summary: "A lightweight oil-in-water serum that seals the cuticle after a wash day.",
};

describe("photo flow", () => {
  it("attaches no search tool on the first read", () => {
    const d = decidePhotoSearch(1, false);
    expect(d.enabled).toBe(false);
    expect(d.maxUses).toBe(0);
  });

  it("grants the budget once the retry is earned", () => {
    const d = decidePhotoSearch(2, true);
    expect(d.enabled).toBe(true);
    expect(d.maxUses).toBeGreaterThan(0);
  });

  it("does not search a second time on its own", () => {
    expect(decidePhotoSearch(2, false).enabled).toBe(false);
  });
});

describe("retry trigger", () => {
  it("stays off for a legible pack", () => {
    expect(needsSearchRetry(readable).needed).toBe(false);
  });

  it("fires when the panel came back empty", () => {
    expect(needsSearchRetry({ ...readable, ingredients: [] }).needed).toBe(true);
  });

  it("fires when the brand or name could not be read", () => {
    expect(needsSearchRetry({ ...readable, brand: "" }).needed).toBe(true);
    expect(needsSearchRetry({ ...readable, product_name: null }).needed).toBe(true);
  });

  it("fires on the model's own admission that the label was unreadable", () => {
    expect(needsSearchRetry({ ...readable, ai_summary: "Couldn't fully read the label — the panel is blurred." }).needed)
      .toBe(true);
  });

  it("fires on a missing payload rather than serving nothing", () => {
    expect(needsSearchRetry(null).needed).toBe(true);
  });
});

describe("url flow", () => {
  const pageWithPanel = `Nylah Marula Serum. ${"Product detail ".repeat(40)}
    Ingredients: Aqua, Glycerin, Sclerocarya Birrea Seed Oil, Panthenol, Cetearyl Alcohol, Citric Acid.`;

  it("recognises a real INCI panel in the fetched page", () => {
    expect(pageLikelyHasInci(pageWithPanel)).toBe(true);
  });

  it("does not mistake marketing copy for a panel", () => {
    expect(pageLikelyHasInci(`${"Loved by curly girls everywhere. ".repeat(20)}`)).toBe(false);
    expect(pageLikelyHasInci("Ingredients: water")).toBe(false);
    expect(pageLikelyHasInci(null)).toBe(false);
  });

  it("skips search when the page already covers the product", () => {
    expect(decideUrlSearch({ havePage: true, pageText: pageWithPanel }).enabled).toBe(false);
  });

  it("keeps the budget when the page is thin or gated", () => {
    expect(decideUrlSearch({ havePage: true, pageText: "Sign in to view." }).enabled).toBe(true);
    expect(decideUrlSearch({ havePage: false }).enabled).toBe(true);
  });

  it("skips search when cached shared facts already hold the formula", () => {
    expect(sourcesCoverProduct({ haveSharedFacts: true, ...readable })).toBe(true);
    expect(decideUrlSearch({ havePage: true, haveSharedFacts: true, ...readable }).enabled).toBe(false);
  });
});

describe("wiring", () => {
  const photo = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/product-analyse/index.ts"),
    "utf8",
  );
  const url = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/product-analyse-url/index.ts"),
    "utf8",
  );

  it("the photo scan gates its server tool list and re-asks only when needed", () => {
    expect(photo).toContain("server_tools: searchDecision.enabled ? [webSearchTool] : []");
    expect(photo).toContain("needsSearchRetry(payload)");
    expect(photo).toContain("allowSearch: true");
  });

  it("the photo scan tells the model no tool is attached instead of letting it hallucinate", () => {
    expect(photo).toContain("NO SEARCH TOOL IS AVAILABLE ON THIS CALL");
  });

  it("the url scan gates search behind the prefetched page", () => {
    expect(url).toContain("decideUrlSearch({");
    expect(url).toContain("searchDecision.enabled ? [webFetchTool, webSearchTool] : [webFetchTool]");
  });
});
