// ORDER-INSENSITIVE NAME LOCK (2026-09-03). A label writes the common name on
// one side, the model writes it on the other — same ingredient, and it must not
// throw the generation away. An ingredient the product does not hold still must.
import { describe, expect, it } from "vitest";
import {
  buildNameLock,
  validateIngredientCardNames,
  validateIngredientMentions,
} from "../../supabase/functions/_shared/ingredient-name-lock.ts";

const supplied = [
  "Butyrospermum Parkii (Shea) Butter",
  "Cocos Nucifera (Coconut) Oil",
  "Ricinus Communis Seed Oil",
];
const ctx = buildNameLock(supplied, [...supplied, "Biotin", "Silica", "Dimethicone"]);

describe("name lock word-order tolerance", () => {
  it("accepts a reversed common-name rendering as a card name", () => {
    expect(
      validateIngredientCardNames([{ name: "Shea Butter (Butyrospermum Parkii)" }], ctx),
    ).toHaveLength(0);
  });

  it("still rejects an ingredient that is not in the supplied list", () => {
    expect(validateIngredientCardNames([{ name: "Biotin" }], ctx)).toHaveLength(1);
  });

  it("still flags an unsupplied ingredient named in prose", () => {
    const v = validateIngredientMentions("ai_summary", "Dimethicone smooths the cuticle.", ctx);
    expect(v).toHaveLength(1);
  });
});
