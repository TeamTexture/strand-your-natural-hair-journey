import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normaliseInciKey } from "@/lib/inci";

export interface IngredientExplainer {
  /** LAYER 1 — shared glossary row. */
  glossary: {
    id: string;
    inci_key: string;
    display_name: string;
    phonetic: string | null;
    category: string | null;
    what_it_is: string | null;
    kind?: "molecule" | "class" | "concept";
  } | null;
  /** Why it sits in this particular product. */
  role_in_product: string | null;
  product_category?: string | null;
  /**
   * LAYER 3 — "Works with your hair". When the sheet is opened from a saved
   * product this is the product-specific analysis verdict (the single source of
   * truth), so it can never contradict the score card. `null` with
   * `fit_note === "not_flagged"` means that analysis did not single this
   * ingredient out either way.
   */
  fit: {
    tone: "good" | "warn" | "bad";
    for_you: string;
    usage_tip: string;
    _source?: "product_analysis" | "profile";
  } | null;
  fit_note?: "not_flagged" | null;
}

export interface ShelfMatch {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  match_score: number | null;
  image_url: string | null;
  storage_path: string | null;
  on_shelf: boolean | null;
}

/**
 * Loads the three layers behind the ingredient explainer sheet. Layers 1 and 3
 * come from the `ingredient-explainer` function (which caches them in the
 * database, so a second tap is a straight read), and the shelf cross-reference
 * comes from the LAYER 2 ingredient ↔ product index.
 */
export function useIngredientExplainer(
  name: string | null,
  userProductId?: string | null,
) {
  const { user } = useAuth();
  const key = name ? normaliseInciKey(name) : null;

  const explainer = useQuery({
    queryKey: ["ingredient-explainer", key, userProductId ?? null, user?.id],
    enabled: Boolean(key && user?.id),
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<IngredientExplainer> => {
      const { data, error } = await supabase.functions.invoke("ingredient-explainer", {
        body: { mode: "sheet", name, userProductId: userProductId ?? null },
      });
      if (error) throw error;
      return data as IngredientExplainer;
    },
  });

  const shelf = useQuery({
    queryKey: ["ingredient-shelf", key, user?.id],
    enabled: Boolean(key && user?.id),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<ShelfMatch[]> => {
      const { data: term } = await supabase
        .from("glossary_terms")
        .select("id, kind, class_category, match_keywords")
        .eq("inci_key", key!)
        .maybeSingle();
      const row = term as unknown as {
        id: string;
        kind: string | null;
        class_category: string | null;
        match_keywords: string[] | null;
      } | null;
      if (!row?.id) return [];

      // A CONCEPT (porosity, cuticle) has no shelf footprint. A CLASS resolves
      // to every molecule in that family; a MOLECULE resolves to itself.
      let ingredientIds: string[] = [row.id];
      if (row.kind === "concept") return [];
      if (row.kind === "class") {
        const ids = new Set<string>();
        if (row.class_category) {
          const { data } = await supabase
            .from("glossary_terms")
            .select("id")
            .eq("kind", "molecule")
            .eq("category", row.class_category);
          for (const r of (data ?? []) as unknown as Array<{ id: string }>) ids.add(r.id);
        }
        for (const keyword of (row.match_keywords ?? []).slice(0, 12)) {
          const { data } = await supabase
            .from("glossary_terms")
            .select("id")
            .eq("kind", "molecule")
            .ilike("display_name", `%${keyword}%`);
          for (const r of (data ?? []) as unknown as Array<{ id: string }>) ids.add(r.id);
        }
        if (ids.size === 0) return [];
        ingredientIds = [...ids].slice(0, 300);
      }

      const { data, error } = await supabase
        .from("product_ingredients")
        .select(
          "user_products!inner(id, name, brand, category, match_score, image_url, storage_path, on_shelf)",
        )
        .in("ingredient_id", ingredientIds)
        .eq("user_products.user_id", user!.id);
      if (error) throw error;
      const rows = (data ?? [])
        .map((r) => (r as unknown as { user_products: ShelfMatch }).user_products)
        .filter(Boolean);
      const seen = new Set<string>();
      return rows.filter((p) => {
        if (!p || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
  });


  return {
    explainer: explainer.data ?? null,
    isLoading: explainer.isLoading,
    error: explainer.error as Error | null,
    shelf: shelf.data ?? [],
    shelfLoading: shelf.isLoading,
  };
}
