// Hooks for product ratings + auto-derived avoid / favourite ingredient lists.
//
// Rules:
//  - When a user saves a 1-2★ rating: any ingredient that appears in ≥2 of their
//    ≤2★ products is added to the "avoid" list with a reason like
//    "Found in 3 of your lowest rated products".
//  - When a user saves a 4-5★ rating: same logic against ≥4★ products
//    populates the "favourite" list.
//  - Ingredients that no longer satisfy the threshold are removed from the
//    relevant list, so the lists always reflect current ratings.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ListKind = "avoid" | "favourite";

export interface IngredientListRow {
  id: string;
  ingredient: string;
  reason: string;
  product_count: number;
  list_kind: ListKind;
}

const MIN_PRODUCTS_FOR_LIST = 2;
// Ingredients that are too generic / vehicle-only to be meaningful — skip when
// aggregating so we don't surface "Water" as either avoid or favourite.
const GENERIC_INGREDIENTS = new Set(
  [
    "water",
    "aqua",
    "fragrance",
    "parfum",
    "phenoxyethanol",
  ].map((s) => s.toLowerCase()),
);

const normaliseIngredient = (raw: string) =>
  raw.replace(/\s+/g, " ").trim();

const keyOf = (raw: string) => normaliseIngredient(raw).toLowerCase();

/**
 * Recompute the avoid OR favourite list for the current user from their
 * product_ratings. Replaces the existing rows for that list_kind so removed
 * matches drop out cleanly.
 */
async function recomputeList(userId: string, kind: ListKind) {
  const ratingFilter =
    kind === "avoid"
      ? { gte: 1, lte: 2 }
      : { gte: 4, lte: 5 };

  const { data: ratings, error } = await supabase
    .from("product_ratings")
    .select("ingredients, rating")
    .eq("user_id", userId)
    .gte("rating", ratingFilter.gte)
    .lte("rating", ratingFilter.lte);

  if (error) throw error;

  // Tally how many qualifying products contain each ingredient.
  const tally = new Map<string, { display: string; count: number }>();
  for (const row of ratings ?? []) {
    const seen = new Set<string>();
    for (const raw of row.ingredients ?? []) {
      const k = keyOf(raw);
      if (!k || GENERIC_INGREDIENTS.has(k) || seen.has(k)) continue;
      seen.add(k);
      const existing = tally.get(k);
      if (existing) {
        existing.count += 1;
      } else {
        tally.set(k, { display: normaliseIngredient(raw), count: 1 });
      }
    }
  }

  const qualifying = Array.from(tally.entries())
    .filter(([, v]) => v.count >= MIN_PRODUCTS_FOR_LIST)
    .map(([, v]) => ({
      ingredient: v.display,
      product_count: v.count,
      reason:
        kind === "avoid"
          ? `Found in ${v.count} of your lowest rated products`
          : `Found in ${v.count} of your highest rated products`,
      list_kind: kind,
    }));

  // Replace the user's rows for this list kind. Simplest correct approach.
  const { error: delErr } = await supabase
    .from("ingredient_lists")
    .delete()
    .eq("user_id", userId)
    .eq("list_kind", kind);
  if (delErr) throw delErr;

  if (qualifying.length === 0) return;

  const { error: insErr } = await supabase.from("ingredient_lists").insert(
    qualifying.map((q) => ({
      user_id: userId,
      list_kind: q.list_kind,
      ingredient: q.ingredient,
      reason: q.reason,
      product_count: q.product_count,
    })),
  );
  if (insErr) throw insErr;
}

export interface SaveRatingArgs {
  productKey: string;
  productName: string;
  productBrand: string;
  rating: number;
  ingredients: string[];
}

/**
 * Persists a star rating for a product and recomputes the appropriate list
 * (avoid for 1-2★, favourite for 4-5★, neither for 3★).
 */
export async function saveProductRating(args: SaveRatingArgs) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in");

  const cleanIngredients = Array.from(
    new Set(
      (args.ingredients ?? [])
        .map((i) => normaliseIngredient(i))
        .filter((i) => i.length > 0 && i.length < 120),
    ),
  );

  const { error } = await supabase.from("product_ratings").upsert(
    {
      user_id: user.id,
      product_key: args.productKey,
      product_name: args.productName,
      product_brand: args.productBrand,
      rating: args.rating,
      ingredients: cleanIngredients,
    },
    { onConflict: "user_id,product_key" },
  );
  if (error) throw error;

  // Recompute lists that this rating affects. We always recompute *both*
  // because changing a rating from e.g. 5★ → 2★ should remove the ingredient
  // from favourites and potentially add it to avoid.
  await Promise.all([
    recomputeList(user.id, "avoid"),
    recomputeList(user.id, "favourite"),
  ]);
}

export function useIngredientLists() {
  const [avoid, setAvoid] = useState<IngredientListRow[]>([]);
  const [favourites, setFavourites] = useState<IngredientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setAvoid([]);
        setFavourites([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("ingredient_lists")
        .select("id, ingredient, reason, product_count, list_kind")
        .eq("user_id", user.id)
        .order("product_count", { ascending: false });
      if (fetchError) throw fetchError;
      const rows = (data ?? []) as IngredientListRow[];
      setAvoid(rows.filter((r) => r.list_kind === "avoid"));
      setFavourites(rows.filter((r) => r.list_kind === "favourite"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { avoid, favourites, loading, error, refresh };
}
