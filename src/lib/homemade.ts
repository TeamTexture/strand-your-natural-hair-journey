// Shared shapes for member-made (homemade / DIY) shelf products.
//
// The recipe is the source of truth for the ANALYSIS (amounts matter), while
// `user_products.ingredients` stays the flat name list every other surface
// already reads — the two are kept in sync at write time by
// `recipeIngredientNames`, so nothing downstream needs to know about recipes.

export interface RecipeItem {
  ingredient: string;
  /** Free text on purpose: "5 drops", "2 tbsp", "a handful". */
  amount: string;
}

/** Categories reused from the existing shelf category vocabulary. */
export const HOMEMADE_CATEGORIES: { value: string; label: string }[] = [
  { value: "shampoo", label: "Shampoo / cleanser" },
  { value: "conditioner", label: "Conditioner" },
  { value: "treatment", label: "Treatment" },
  { value: "serum", label: "Serum" },
  { value: "styler", label: "Styler" },
  { value: "mask", label: "Mask" },
  { value: "oil", label: "Oil" },
  { value: "leave-in", label: "Leave-in" },
  { value: "other", label: "Other" },
];

/** Parses the stored jsonb column defensively. */
export function parseRecipe(raw: unknown): RecipeItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ingredient = String(r.ingredient ?? "").trim();
    if (!ingredient) continue;
    out.push({ ingredient, amount: String(r.amount ?? "").trim() });
  }
  return out;
}

/** The flat ingredient list mirrored into `user_products.ingredients`. */
export function recipeIngredientNames(recipe: RecipeItem[]): string[] {
  return recipe.map((r) => r.ingredient.trim()).filter(Boolean);
}

/** Shape of the standalone safety caution returned for homemade products. */
export interface HomemadeSafetyPayload {
  severity: "hazard" | "caution" | "ok";
  headline: string;
  hazards: Array<{
    id: string;
    trigger: string;
    severity: "hazard" | "caution";
    title: string;
    body: string;
  }>;
  unverified: string[];
}
