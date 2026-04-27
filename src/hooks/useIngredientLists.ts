// Hooks for the auto-derived "Flagged ingredients" list.
//
// Rule:
//   FLAG: an ingredient that appears in 3 OR MORE of the user's products
//   that are ALL of: on the shelf, marked as a favourite, AND actively
//   in use (use_count > 0). The flag is purely educational — it tells
//   the user "this ingredient keeps showing up in the products you
//   actually love and use, here's what it is and which of your products
//   contain it." No good/bad framing.
//
// Backed by the existing `ingredient_lists` table using `list_kind = "flag"`.
// Old `avoid` and `favourite` rows are deleted on each recompute so the
// migration is self-healing without needing a destructive SQL migration.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ListKind = "flag";

export interface IngredientListRow {
  id: string;
  ingredient: string;
  reason: string;
  product_count: number;
  list_kind: ListKind;
}

// An ingredient must show up in this many qualifying products (on shelf AND
// favourited) before it earns a flag. Two is the sweet spot: it surfaces
// genuine cross-product patterns without requiring the user to own three
// fully-scanned favourites before *anything* shows up.
const MIN_PRODUCTS_FOR_FLAG = 2;

// Ingredients that are too generic / vehicle-only to be meaningful — skip
// when aggregating so we don't surface "Water" as a flagged ingredient.
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
 * Recompute the unified "flag" list for the current user from the products
 * that are on shelf (i.e. actively in use) AND favourited. Replaces existing
 * rows so removed matches drop out cleanly, and also wipes any leftover
 * legacy "avoid" / "favourite" rows.
 */
async function recomputeFlagList(userId: string) {
  // "On shelf" = the user is actively using it (off-shelf products are
  // retired). Combined with `on_favourite`, this is the set of products
  // the user actually loves and uses — the only ones that count for
  // spotting recurring ingredients.
  const { data: rows, error } = await supabase
    .from("user_products")
    .select("ingredients")
    .eq("user_id", userId)
    .eq("on_shelf", true)
    .eq("on_favourite", true);
  if (error) throw error;

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
      reason: `Appears in ${v.count} of your favourite products in use`,
      list_kind: "flag" as const,
    }));

  // Replace ALL ingredient_lists rows for this user — this also clears any
  // legacy "avoid" / "favourite" rows from the previous two-list system.
  const { error: delErr } = await supabase
    .from("ingredient_lists")
    .delete()
    .eq("user_id", userId);
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

/** Recompute the flag list for the current user. Call after any change to
 *  the user's product library (add, remove, off-shelf, etc.). */
export async function recomputeIngredientFlags() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;
  await recomputeFlagList(user.id);
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
 * Persists a star rating for a product. Star ratings remain (they show on
 * cards and in the PDF report) but they no longer affect the flagged
 * ingredient list — that's now driven solely by membership in the user's
 * product library, recomputed via {@link recomputeIngredientFlags}.
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

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("user-products-updated"));
  }
}

export function useIngredientLists() {
  const [flags, setFlags] = useState<IngredientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setFlags([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("ingredient_lists")
        .select("id, ingredient, reason, product_count, list_kind")
        .eq("user_id", user.id)
        .eq("list_kind", "flag")
        .order("product_count", { ascending: false });
      if (fetchError) throw fetchError;
      setFlags(((data ?? []) as IngredientListRow[]));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load flagged ingredients");
    } finally {
      setLoading(false);
    }
  }, []);

  // Recompute the flag list at most once per browser session — every page
  // that uses the hook used to recompute on mount, which fired DELETE +
  // INSERT against `ingredient_lists` on every navigation, causing visible
  // re-render churn. Mutations elsewhere (add/remove/setShelf/setFavourite)
  // still trigger an explicit recompute so the data stays fresh. The key
  // is versioned so that changing the flag rule auto-invalidates old gates.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "strand_flags_recomputed_session_v4_min2";
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, "1");
    void recomputeIngredientFlags();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch whenever the product library changes elsewhere in the app.
  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("user-products-updated", handler);
    window.addEventListener("ingredient-lists-updated", handler);
    return () => {
      window.removeEventListener("user-products-updated", handler);
      window.removeEventListener("ingredient-lists-updated", handler);
    };
  }, [refresh]);

  return { flags, loading, error, refresh };
}
