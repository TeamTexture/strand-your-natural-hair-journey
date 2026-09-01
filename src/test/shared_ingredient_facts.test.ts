// SHARED PRODUCT-LEVEL INGREDIENT FACTS (2026-09-01)
//
// An INCI list and what each molecule physically does are true for every
// member. These tests lock the identity rules (same bottle → same row, a
// reformulation → a different row), the completeness bar that decides whether
// the cards may be reused, and the invariant that nothing member-specific
// (score, guidance, sensitivity overlay) can ever reach the shared row.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  factsCoverIngredients,
  factsIdentityKey,
  ingredientsHash,
  rebuildCardsFromFacts,
  sharedFactsBlock,
  type SharedIngredientFact,
} from "../../supabase/functions/_shared/ingredient-facts-cache.ts";

const fact = (
  name: string,
  body = "A cationic conditioning agent that adsorbs to the cuticle and reduces surface friction.",
): SharedIngredientFact => ({ name, category: "Conditioning Agent", body, tone: "good" });

describe("shared facts identity", () => {
  it("resolves the same bottle to one key however it was typed", () => {
    const a = factsIdentityKey("Biomimetic Hairscience Molecular Repair Hair Mask", "K18");
    const b = factsIdentityKey("k18 biomimetic hairscience molecular repair hair mask", "K18 Biomimetic Hairscience");
    expect(a).toBe(b);
  });

  it("keeps different products apart", () => {
    expect(factsIdentityKey("Hydrate Shampoo", "Nylah")).not.toBe(
      factsIdentityKey("Hydrate Conditioner", "Nylah"),
    );
  });

  it("hashes the formula order-insensitively but reacts to a reformulation", async () => {
    const one = await ingredientsHash(["Aqua", "Glycerin", "Cetearyl Alcohol"]);
    const same = await ingredientsHash(["cetearyl alcohol", "AQUA", "Glycerin"]);
    const reformulated = await ingredientsHash(["Aqua", "Glycerin", "Cetearyl Alcohol", "Panthenol"]);
    expect(one).toBe(same);
    expect(one).not.toBe(reformulated);
    expect(await ingredientsHash([])).toBe("empty");
  });
});

describe("completeness bar", () => {
  const inci = ["Aqua", "Glycerin", "Behentrimonium Chloride"];

  it("only counts as reusable when every ingredient has a real mechanism", () => {
    const full = inci.map((n) => fact(n));
    expect(factsCoverIngredients(full, inci)).toBe(true);
  });

  it("rejects a partial set", () => {
    expect(factsCoverIngredients([fact("Aqua"), fact("Glycerin")], inci)).toBe(false);
  });

  it("rejects a set whose mechanisms are empty or thin", () => {
    const thin = inci.map((n) => ({ ...fact(n), body: "A thing." }));
    expect(factsCoverIngredients(thin, inci)).toBe(false);
    const nulled = inci.map((n) => ({ ...fact(n), body: null }));
    expect(factsCoverIngredients(nulled, inci)).toBe(false);
  });
});

describe("card rebuild on a cache hit", () => {
  const inci = ["Aqua", "Glycerin", "Panthenol"];

  it("rebuilds every card in the member's own INCI order", () => {
    const cards = rebuildCardsFromFacts(inci, inci.map((n) => fact(n)));
    expect(cards.map((c) => c.name)).toEqual(inci);
    expect(cards.every((c) => (c.body ?? "").length > 20)).toBe(true);
  });

  it("never invents a card for an ingredient the member does not hold", () => {
    const cards = rebuildCardsFromFacts(["Aqua"], [fact("Aqua"), fact("Dimethicone")]);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Aqua");
  });

  it("falls back to the model's own card when the shared set misses one", () => {
    const cards = rebuildCardsFromFacts(inci, [fact("Aqua"), fact("Glycerin")], [
      { name: "Panthenol", tone: "good", category: "Humectant", body: "Draws water into the cortex." },
    ]);
    expect(cards[2].body).toContain("Draws water");
  });

  it("tells the model not to reproduce the cards", () => {
    const block = sharedFactsBlock([fact("Aqua")]);
    expect(block).toMatch(/DO NOT return the ingredients array/i);
    expect(block).toContain("Aqua");
  });
});

describe("nothing member-specific is ever shared", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/_shared/ingredient-facts-cache.ts"),
    "utf8",
  );

  it("a card carrying a personal sensitivity overlay blocks the write", () => {
    expect(src).toMatch(/sensitivity === true\) return;/);
  });

  it("only the four formula-level fields survive into the row", () => {
    expect(src).toMatch(/function cleanFact/);
    for (const personal of ["match_score", "score_reasons", "personalised_guidance", "relevance_note", "user_id"]) {
      expect(src).not.toContain(personal);
    }
  });
});

describe("ingredient-analysis wiring", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/ingredient-analysis/index.ts"),
    "utf8",
  );

  it("reads the shared facts before the model call", () => {
    expect(src).toContain("readSharedFacts({");
  });

  it("asks for the personalisation only on a complete hit", () => {
    expect(src).toContain("personalisationOnly: !!sharedCards");
    expect(src).toMatch(/personalisationOnlySchema/);
  });

  it("re-attaches the cards deterministically before any validation", () => {
    expect(src).toContain("rebuildCardsFromFacts(");
  });

  it("publishes the facts only when it generated them itself, and never for a homemade recipe", () => {
    expect(src).toMatch(/if \(!sharedCards && !isHomemade && Array\.isArray\(analysis\.ingredients\)\)/);
  });
});
