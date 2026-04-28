// Hooks for the auto-derived "Flagged ingredients" list.
//
// Rule:
//   FLAG: an ingredient that appears in 3 OR MORE of the user's products
//   that are BOTH on the shelf and marked as a favourite. The flag is purely
//   educational — it tells
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
// favourited) before it earns a flag.
const MIN_PRODUCTS_FOR_FLAG = 3;

// Ingredients that are too generic / non-actionable to be meaningful — skip
// when aggregating. Water is intentionally NOT skipped because the flagged
// list should reflect any ingredient shared by 3+ favourite shelf products.
const GENERIC_INGREDIENTS = new Set(
  [
    "fragrance",
    "parfum",
    "phenoxyethanol",
  ].map((s) => s.toLowerCase()),
);

const normaliseIngredient = (raw: string) => raw.replace(/\s+/g, " ").trim();

const ingredientNameFromUnknown = (item: unknown): string => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "name" in item) {
    return String((item as { name?: unknown }).name ?? "");
  }
  return "";
};

// Build a set of comparison keys from a single ingredient string. This lets
// us match across naming variants (e.g. "Macadamia Oil" vs
// "Macadamia Ternifolia Seed Oil", "Shea Butter" vs
// "Butyrospermum Parkii (Shea) Butter") without needing a curated synonym
// table. We strip parentheses, INCI Latin scaffolding, common suffixes
// like "extract / oil / butter / seed / leaf / juice", and trailing
// asterisks, then yield BOTH the full normalised form and individual
// significant tokens so a partial overlap counts as a match.
const STOPWORDS = new Set([
  "oil", "butter", "extract", "seed", "leaf", "juice", "root", "fruit",
  "kernel", "powder", "water", "aqua", "eau", "the", "and",
]);

const baseKey = (raw: string) =>
  normaliseIngredient(raw)
    .toLowerCase()
    .replace(/\*+$/g, "")
    .replace(/\([^)]*\)/g, " ") // drop parenthetical Latin / common names
    .replace(/\//g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const keysOf = (raw: string): { display: string; keys: string[] } => {
  const display = normaliseIngredient(raw).replace(/\*+$/g, "").trim();
  const base = baseKey(raw);
  if (!base) return { display, keys: [] };
  const keys = new Set<string>();
  keys.add(base);
  const tokens = base.split(" ").filter(Boolean);
  if (tokens.some((tok) => tok === "water" || tok === "aqua" || tok === "eau")) {
    keys.add("water");
  }
  // Tokens — keep multi-word "anchors" by also adding each non-stopword
  // token. This is what lets "macadamia oil" match
  // "macadamia ternifolia seed oil" (both yield the token "macadamia").
  for (const tok of tokens) {
    if (tok.length >= 4 && !STOPWORDS.has(tok)) keys.add(tok);
  }
  return { display, keys: Array.from(keys) };
};

/**
 * Recompute the unified "flag" list for the current user from the products
 * that are on shelf (i.e. actively in use) AND favourited. Replaces existing
 * rows so removed matches drop out cleanly, and also wipes any leftover
 * legacy "avoid" / "favourite" rows.
 */
async function recomputeFlagList(userId: string) {
  // "On shelf" + `on_favourite` is the set of products the user actually
  // loves and keeps in rotation — the only ones that count for spotting
  // recurring ingredients. Prefer the full INCI list, but fall back to saved
  // key ingredients when an older scan/link produced no full ingredient list.
  const { data: rows, error } = await supabase
    .from("user_products")
    .select("product_key, name, brand, ingredients, key_ingredients")
    .eq("user_id", userId)
    .eq("on_shelf", true)
    .eq("on_favourite", true);
  if (error) throw error;

  const productKeys = (rows ?? [])
    .map((row) => row.product_key)
    .filter((key): key is string => Boolean(key));
  const productsMissingFullIngredients = (rows ?? [])
    .filter((row) => ((row.ingredients ?? []) as string[]).length === 0);
  const { data: ratingRows, error: ratingsError } = productKeys.length > 0
    ? await supabase
        .from("product_ratings")
        .select("product_key, ingredients")
        .eq("user_id", userId)
        .in("product_key", productKeys)
    : { data: [], error: null };
  if (ratingsError) throw ratingsError;
  const ratingIngredientsByKey = new Map(
    ((ratingRows ?? []) as Array<{ product_key: string; ingredients: string[] }>).map((row) => [
      row.product_key,
      row.ingredients ?? [],
    ]),
  );

  const { data: cachedAnalyses, error: cacheError } = productsMissingFullIngredients.length > 0
    ? await supabase
        .from("ai_summaries")
        .select("kind, payload")
        .eq("user_id", userId)
        .in("kind", productsMissingFullIngredients.map((row) => `ingredient_analysis:${row.product_key}`))
    : { data: [], error: null };
  if (cacheError) throw cacheError;
  const cachedIngredientsByKind = new Map(
    ((cachedAnalyses ?? []) as Array<{ kind: string; payload: { ingredients?: unknown[] } }>).map((row) => [
      row.kind,
      (row.payload?.ingredients ?? []).map(ingredientNameFromUnknown).filter(Boolean),
    ]),
  );

  // Per-key tally: count = number of qualifying products this key appeared
  // in. We also remember the longest/most descriptive display string we've
  // seen so the UI shows a readable name (e.g. prefer
  // "Macadamia Ternifolia Seed Oil" over the bare token "macadamia").
  const tally = new Map<string, { display: string; count: number }>();
  for (const row of rows ?? []) {
    // Always merge BOTH the full INCI list and the simplified
    // key_ingredients names. Older scans / URL imports often only have
    // key_ingredients populated, and we want those to count toward — and
    // match against — the full INCI of newer scans.
    const fullIngredients = (row.ingredients ?? []) as string[];
    const ratingIngredients = ratingIngredientsByKey.get(row.product_key) ?? [];
    const cachedIngredients = cachedIngredientsByKind.get(`ingredient_analysis:${row.product_key}`) ?? [];
    const keyIngredients = Array.isArray(row.key_ingredients)
      ? row.key_ingredients
          .map(ingredientNameFromUnknown)
          .filter(Boolean)
      : [];
    const sourceIngredients = [
      ...fullIngredients,
      ...ratingIngredients,
      ...cachedIngredients,
      ...keyIngredients,
    ];

    // De-dup keys WITHIN this product so a single product can't double-count
    // (e.g. listing both "Shea Butter" in key_ingredients and
    // "Butyrospermum Parkii (Shea) Butter" in the full INCI).
    const seenForProduct = new Set<string>();
    for (const raw of sourceIngredients) {
      const { display, keys } = keysOf(raw);
      if (keys.length === 0) continue;
      // Skip if any of the keys map to a generic "vehicle" ingredient.
      if (keys.some((k) => GENERIC_INGREDIENTS.has(k))) continue;
      for (const k of keys) {
        if (seenForProduct.has(k)) continue;
        seenForProduct.add(k);
        const displayName = k === "water" ? "Water" : display;
        const existing = tally.get(k);
        if (existing) {
          existing.count += 1;
          if (displayName.length > existing.display.length) existing.display = displayName;
        } else {
          tally.set(k, { display: displayName, count: 1 });
        }
      }
    }
  }

  // Collapse duplicates by display name — multiple keys (full INCI string +
  // its anchor token) often resolve to the same human-readable ingredient.
  // Take the highest count seen across all keys for that display name.
  const byDisplay = new Map<string, { display: string; count: number }>();
  for (const v of tally.values()) {
    if (v.count < MIN_PRODUCTS_FOR_FLAG) continue;
    const dKey = v.display.toLowerCase();
    const prev = byDisplay.get(dKey);
    if (!prev || v.count > prev.count) byDisplay.set(dKey, v);
  }

  const qualifying = Array.from(byDisplay.values())
    .sort((a, b) => b.count - a.count)
    .map((v) => ({
      ingredient: v.display,
      product_count: v.count,
      reason: `Appears in ${v.count} of your favourite shelf products`,
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
    const KEY = "strand_flags_recomputed_session_v8_cached_full_ingredients";
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
