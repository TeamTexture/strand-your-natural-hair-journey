// Sanity check on the curated RAG trigger list. The list is small enough
// that a one-line test guards against accidental wholesale deletion.
import { describe, expect, it } from "vitest";
import {
  RAG_TRIGGER_INGREDIENTS,
  matchTriggerIngredient,
  shouldTriggerRag,
} from "../../supabase/functions/_shared/rag-triggers.ts";

describe("RAG trigger ingredients", () => {
  it("is non-empty and contains the canonical anchors", () => {
    expect(RAG_TRIGGER_INGREDIENTS.length).toBeGreaterThan(0);
    expect(RAG_TRIGGER_INGREDIENTS).toContain("minoxidil");
    expect(RAG_TRIGGER_INGREDIENTS).toContain("shea butter");
  });

  it("matches case-insensitive substrings (Hydrolyzed Wheat Protein → hydrolyzed protein/wheat)", () => {
    expect(matchTriggerIngredient("Hydrolyzed Wheat Protein")).not.toBeNull();
  });

  it("does not trigger on plain water/glycerin", () => {
    expect(shouldTriggerRag(["Water", "Glycerin", "Cetyl Alcohol"], [])).toBe(false);
  });

  it("triggers when an ingredient is on the user's personal avoid list", () => {
    expect(shouldTriggerRag(["Water", "Fragrance"], ["fragrance"])).toBe(true);
  });
});
