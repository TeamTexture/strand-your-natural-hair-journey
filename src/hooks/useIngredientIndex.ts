import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface IndexableProduct {
  id: string;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  ingredients?: string[] | null;
}

/**
 * LAYER 2 — keeps the ingredient ↔ product index warm.
 *
 * Fires once per product per session when a product page opens: the function
 * generates any missing glossary rows and links this product's INCI list to
 * them, which is what powers "Also on your shelf" and the tappable tokens in
 * AI copy. Cheap and idempotent — already-indexed products cost one round trip.
 */
export function useIngredientIndex(product: IndexableProduct | null | undefined) {
  const qc = useQueryClient();
  const done = useRef<Set<string>>(new Set());

  useEffect(() => {
    const names = (product?.ingredients ?? []).filter((n) => typeof n === "string" && n.trim());
    if (!product?.id || names.length === 0) return;
    if (done.current.has(product.id)) return;
    done.current.add(product.id);

    let cancelled = false;
    void (async () => {
      const { error } = await supabase.functions.invoke("ingredient-explainer", {
        body: {
          mode: "index",
          userProductId: product.id,
          ingredients: names,
          productName: product.name ?? undefined,
          productBrand: product.brand ?? undefined,
          productCategory: product.category ?? null,
        },
      });
      if (!cancelled && !error) {
        void qc.invalidateQueries({ queryKey: ["ingredient-glossary"] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.ingredients, product?.name, product?.brand, product?.category, qc]);
}
