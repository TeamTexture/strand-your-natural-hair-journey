// Hooks for the auto-derived Green Flag / Red Flag ingredient lists.
//
// Rules (driven by product membership, NOT star ratings):
//  - GREEN FLAG: an ingredient that appears in ≥3 of the user's *favourited*
//    products (user_products.on_favourite = true).
//  - RED FLAG:   an ingredient that appears in ≥3 of the user's *off-shelf*
//    products (user_products with previously_on_shelf = true and on_shelf = false).
//
// Star ratings are no longer used to drive these lists. The heart icon on a
// product page (and the Favourites tab) is the single source of truth for
// what counts as a favourite.
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

const MIN_PRODUCTS_FOR_FLAG = 3;

// Ingredients that are too generic / vehicle-only to be meaningful — skip
// when aggregating so we don't surface "Water" as either flag.
const GENERIC_INGREDIENTS = new Set(
  [
    "water",
    "aqua",
    "fragrance",
    "parfum",
    "phenoxyethanol",
  ].map((s) => s.toLowerCase()),
);

const normaliseIngredient = (raw: string) => raw.replace(/\s+/g, " ").trim();
const keyOf = (raw: string) => normaliseIngredient(raw).toLowerCase();

/**
 * Recompute the Red Flag (avoid) OR Green Flag (favourite) list for the
 * current user from their user_products membership. Replaces existing rows
 * for that list_kind so removed matches drop out cleanly.
 */
async function recomputeList(userId: string, kind: ListKind) {
  // Pick the source set of products for this list_kind.
  let query = supabase
    .from("user_products")
    .select("ingredients, on_favourite, on_shelf, previously_on_shelf")
    .eq("user_id", userId);

  if (kind === "favourite") {
    query = query.eq("on_favourite", true);
  } else {
    // Off-shelf = was on shelf, then removed.
    query = query.eq("on_shelf", false).eq("previously_on_shelf", true);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  // Tally how many qualifying products contain each ingredient.
  const tally = new Map<string, { display: string; count: number }>();
  for (const row of rows ?? []) {
    const seen = new Set<string>();
    for (const raw of (row.ingredients ?? []) as string[]) {
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
    .filter(([, v]) => v.count >= MIN_PRODUCTS_FOR_FLAG)
    .map(([, v]) => ({
      ingredient: v.display,
      product_count: v.count,
      reason:
        kind === "avoid"
          ? `Found in ${v.count} of your off-shelf products`
          : `Found in ${v.count} of your favourited products`,
      list_kind: kind,
    }));

  // Replace this user's rows for this list kind.
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

/** Recompute both lists for the current user. Call after favourite/off-shelf changes. */
export async function recomputeIngredientFlags() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;
  await Promise.all([
    recomputeList(user.id, "favourite"),
    recomputeList(user.id, "avoid"),
  ]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ingredient-lists-updated"));
  }
}

export interface SaveRatingArgs {
  productKey: string;
  productName: string;
  productBrand: string;
  rating: number;
  ingredients: string[];
}

/**
 * Persists a star rating for a product. Star ratings are kept (they show on
 * cards + power the existing PDF report) but they NO LONGER drive the
 * Green/Red flag ingredient lists — that's now driven by favourites and
 * off-shelf membership, recomputed via {@link recomputeIngredientFlags}.
 */
export async function saveProductRating(args: SaveRatingArgs) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in");

  const { data: savedProduct } = await supabase
    .from("user_products")
    .select("id, ingredients")
    .eq("user_id", user.id)
    .eq("product_key", args.productKey)
    .maybeSingle();

  const sourceIngredients = args.ingredients.length > 0
    ? args.ingredients
    : ((savedProduct?.ingredients ?? []) as string[]);

  const cleanIngredients = Array.from(
    new Set(
      (sourceIngredients ?? [])
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

  if (savedProduct?.id) {
    const { error: productError } = await supabase
      .from("user_products")
      .update({ rating: args.rating })
      .eq("id", savedProduct.id)
      .eq("user_id", user.id);
    if (productError) throw productError;
  }

  // Notify any mounted product lists to refresh their stars.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("user-products-updated"));
  }
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

  // Re-fetch whenever favourites / off-shelf status changes elsewhere in the
  // app so the Green / Red flag lists update without a manual reload.
  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("user-products-updated", handler);
    window.addEventListener("ingredient-lists-updated", handler);
    return () => {
      window.removeEventListener("user-products-updated", handler);
      window.removeEventListener("ingredient-lists-updated", handler);
    };
  }, [refresh]);

  return { avoid, favourites, loading, error, refresh };
}
