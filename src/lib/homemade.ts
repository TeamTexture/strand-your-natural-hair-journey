// Shared shapes for member-made (homemade / DIY) shelf products.
//
// The recipe is the source of truth for the ANALYSIS (amounts matter), while
// `user_products.ingredients` stays the flat name list every other surface
// already reads — the two are kept in sync at write time by
// `recipeIngredientNames`, so nothing downstream needs to know about recipes.

export interface RecipeItem {
  ingredient: string;
  /**
   * Human-readable amount, always present when anything was given. Derived
   * from qty+unit when those are set, otherwise the free-text description.
   * Every existing consumer (safety check, prompt, cache key) reads this.
   */
  amount: string;
  /** Structured numeric quantity, when she gave one. */
  qty?: string;
  /** Structured unit, when the amount fits one (see RECIPE_UNITS). */
  unit?: string;
}

/** Units offered next to the numeric amount. "other" reveals free text. */
export const RECIPE_UNITS: { value: string; label: string }[] = [
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "tsp", label: "tsp" },
  { value: "tbsp", label: "tbsp" },
  { value: "cup", label: "cup" },
  { value: "drops", label: "drops" },
  { value: "pumps", label: "pumps" },
  { value: "other", label: "Other…" },
];

const KNOWN_UNITS = new Set(
  RECIPE_UNITS.filter((u) => u.value !== "other").map((u) => u.value),
);

/**
 * Builds the display/prompt amount string from whichever parts she filled in.
 * Both parts are optional: a bare number ("2") and a bare unit ("drops") are
 * both acceptable, and an empty result means "no amount given".
 */
export function formatAmount(
  qty: string,
  unit: string,
  freeText: string,
): string {
  if (unit === "other") return freeText.trim();
  const q = qty.trim();
  const u = KNOWN_UNITS.has(unit) ? unit : "";
  if (q && u) return `${q} ${u}`;
  return q || u || freeText.trim();
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
    const qty = String(r.qty ?? "").trim();
    const unit = String(r.unit ?? "").trim();
    const amount = String(r.amount ?? "").trim() || formatAmount(qty, unit, "");
    out.push({
      ingredient,
      amount,
      ...(qty ? { qty } : {}),
      ...(KNOWN_UNITS.has(unit) ? { unit } : {}),
    });
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
  /**
   * Present only when the recipe has a water phase AND a recognised
   * preservative — an honest shelf-life statement instead of the DIY spoilage
   * warning, which would be false here.
   */
  preservation?: {
    status: "preserved";
    names: string[];
    note: string;
  };
}
