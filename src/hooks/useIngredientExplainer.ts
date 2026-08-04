import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normaliseInciKey } from "@/lib/inci";

export interface IngredientExplainer {
  ingredient_id: string | null;
  display_name: string;
  /** LAYER 1 — shared glossary prose. */
  glossary: {
    what_it_is: string | null;
    what_it_does: string | null;
    family: string | null;
  } | null;
  /** Why it sits in this particular product. */
  role_in_product: string | null;
  /** LAYER 3 — per-user fit, regenerated only when the hair/health profile moves. */
  fit: {
    verdict: "suits" | "watch" | "avoid" | "neutral" | null;
    body: string | null;
    signals: string[] | null;
  } | null;
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
      const { data: ing } = await supabase
        .from("ingredients")
        .select("id")
        .eq("inci_key", key!)
        .maybeSingle();
      if (!ing?.id) return [];
      const { data, error } = await supabase
        .from("product_ingredients")
        .select(
          "user_products!inner(id, name, brand, category, match_score, image_url, storage_path, on_shelf)",
        )
        .eq("ingredient_id", ing.id)
        .eq("user_id", user!.id);
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
