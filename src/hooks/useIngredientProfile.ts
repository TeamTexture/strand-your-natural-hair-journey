// React Query hook for fetching the AI-generated ingredient profile shown
// inside the dialog on a Product page (and elsewhere).
//
// The edge function caches per-user (and per-product, since the
// "what this means for your hair type" guidance depends on co-formulants),
// so re-opening a row after the first fetch is instant. The hook is
// `enabled: false` by default — it only fires when the user actually
// opens an ingredient, keeping the page snappy and avoiding unnecessary
// AI spend.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";

export interface IngredientProfile {
  what_it_is: string;
  benefits: string[];
  personal_notes: string[];
  /** 1–2 sentence personalised guidance for the user's hair type,
   * weighing this ingredient + the rest of the formulation. */
  what_it_means_for_you?: string;
}

export interface IngredientProfileContext {
  productKey?: string;
  productName?: string;
  productBrand?: string;
  /** Other ingredients in the same formulation (the model uses these to
   * weigh co-formulants when shaping the personalised guidance). */
  formulationIngredients?: string[];
}

export const useIngredientProfile = (
  ingredient: string | null,
  reason?: string,
  enabled = false,
  productCtx?: IngredientProfileContext,
) => {
  const { user } = useAuth();
  return useQuery<IngredientProfile>({
    queryKey: [
      "ingredient-profile",
      user?.id ?? "anon",
      ingredient ?? "",
      productCtx?.productKey ?? "",
    ],
    enabled: Boolean(enabled && user && ingredient),
    staleTime: 1000 * 60 * 60, // 1h — server caches indefinitely per version
    retry: 1,
    queryFn: async () => {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke(
        "ingredient-profile",
        {
          body: {
            ingredient,
            reason,
            context,
            productKey: productCtx?.productKey,
            productName: productCtx?.productName,
            productBrand: productCtx?.productBrand,
            formulationIngredients: productCtx?.formulationIngredients,
          },
        },
      );
      if (error) {
        const msg =
          (error as { message?: string })?.message ?? "Could not load profile";
        throw new Error(msg);
      }
      const profile = (data as { profile?: IngredientProfile } | null)?.profile;
      if (!profile) throw new Error("Empty profile response");
      return profile;
    },
  });
};
