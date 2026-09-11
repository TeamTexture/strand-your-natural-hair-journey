// Guards the per-surface data-prioritisation prompt blocks: every generation
// surface must receive one, the ordering must name the fields that were being
// ignored, and the standing content boundaries must survive.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  contextPriorityBlock,
  contextPrioritySuffix,
  type PrioritySurface,
} from "../../supabase/functions/_shared/context-priority.ts";

const SURFACES: PrioritySurface[] = [
  "product-analyse",
  "ingredient-analysis",
  "blood-ai-summary",
  "nutrition-plan",
  "wash-day-observation",
  "heat-treatment-rationale",
];

const read = (fn: string) =>
  readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");

describe("context priority blocks", () => {
  it("every surface has a block naming the full data set", () => {
    for (const surface of SURFACES) {
      const block = contextPriorityBlock(surface);
      expect(block.length).toBeGreaterThan(200);
      expect(block).toMatch(/hairProfile/);
      expect(block).toMatch(/NOT ESTABLISHED/);
    }
  });

  it("never lets one characteristic carry the answer", () => {
    for (const surface of SURFACES) {
      expect(contextPriorityBlock(surface)).toMatch(/Porosity is one input among many/);
    }
  });

  it("product and ingredient blocks prioritise chemical history, style and conditions", () => {
    for (const surface of ["product-analyse", "ingredient-analysis"] as const) {
      const block = contextPriorityBlock(surface);
      expect(block).toMatch(/[Cc]hemical history/);
      expect(block).toMatch(/hairstyle/i);
      expect(block).toMatch(/sensitivit/i);
    }
    expect(contextPriorityBlock("product-analyse")).toMatch(/CUMULATIVE STRESS/);
  });

  it("blood block forbids bridging a marker to hair", () => {
    const block = contextPriorityBlock("blood-ai-summary");
    expect(block).toMatch(/may NOT connect any marker to hair/);
    expect(block).toMatch(/No causal connectors/);
  });

  it("nutrition block keeps food-first and states no doses", () => {
    const block = contextPriorityBlock("nutrition-plan");
    expect(block).toMatch(/food before supplements/i);
    expect(block).toMatch(/Never state a dose/);
    expect(block).toMatch(/never mention injections, infusions/);
  });

  it("heat block leads on elasticity and keeps the TT Heat Hat as the only tool", () => {
    const block = contextPriorityBlock("heat-treatment-rationale");
    expect(block).toMatch(/[Ee]lasticity/);
    expect(block).toMatch(/TT Heat Hat/);
  });

  it("suffix is appendable prompt text only", () => {
    expect(contextPrioritySuffix("product-analyse").startsWith("\n\n")).toBe(true);
  });

  it("all seven server surfaces wire the block into their prompts", () => {
    for (const fn of SURFACES) {
      const src = read(fn);
      expect(src, fn).toMatch(/_shared\/context-priority\.ts/);
      expect(src, fn).toMatch(/contextPrioritySuffix\("/);
    }
  });

  it("product-analyse wires both provider paths", () => {
    const src = read("product-analyse");
    const hits = src.match(/contextPrioritySuffix\("product-analyse"\)/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
