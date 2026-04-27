// React Query hook for fetching the AI-generated ingredient profile shown
// inside the dropdown row on the Avoidlist (Green Flag / Red Flag) page.
//
// The edge function caches per-user, so re-opening a row after the first
// fetch is instant. The hook is `enabled: false` by default — it only fires
// when the user actually expands the row, keeping the page snappy and
// avoiding unnecessary AI spend.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";

export interface IngredientProfile {
  what_it_is: string;
  benefits: string[];
  personal_notes: string[];
}

export const useIngredientProfile = (
  ingredient: string | null,
  flag: "fav" | "avoid",
  reason?: string,
  enabled = false,
) => {
  const { user } = useAuth();
  return useQuery<IngredientProfile>({
    queryKey: ["ingredient-profile", user?.id ?? "anon", flag, ingredient ?? ""],
    enabled: Boolean(enabled && user && ingredient),
    staleTime: 1000 * 60 * 60, // 1h — server caches indefinitely per version
    retry: 1,
    queryFn: async () => {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke(
        "ingredient-profile",
        {
          body: { ingredient, flag, reason, context },
        },
      );
      if (error) {
        // supabase.functions.invoke surfaces non-2xx as an error with the
        // body attached on `error.context`. Try to extract the human message.
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
