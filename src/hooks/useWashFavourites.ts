// Wash Day Favourites — the default product saved against each wash-day step.
//
// CRITICAL RULE: favourites only PRE-FILL a new log. Swapping a product while
// logging changes that log only, and past logs always keep the products
// actually used. Nothing here ever rewrites a saved wash day.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WashFavourite {
  step: string;
  product_id: string | null;
}

/** step → product id, for the signed-in member. */
export function useWashFavourites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wash-favourites", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("wash_day_favourites")
        .select("step, product_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as WashFavourite[]) {
        if (row.product_id) map[row.step] = row.product_id;
      }
      return map;
    },
  });
}

/** Replace the whole favourites set. Applies from the next wash day forward. */
export function useSaveWashFavourites() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (map: Record<string, string | null>) => {
      if (!user) throw new Error("Please sign in first.");
      const entries = Object.entries(map);
      const setRows = entries
        .filter(([, id]) => !!id)
        .map(([step, id]) => ({ user_id: user.id, step, product_id: id as string }));
      const clearSteps = entries.filter(([, id]) => !id).map(([step]) => step);

      if (setRows.length) {
        const { error } = await supabase
          .from("wash_day_favourites")
          .upsert(setRows as never, { onConflict: "user_id,step" });
        if (error) throw error;
      }
      if (clearSteps.length) {
        const { error } = await supabase
          .from("wash_day_favourites")
          .delete()
          .eq("user_id", user.id)
          .in("step", clearSteps);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wash-favourites", user?.id] });
    },
  });
}
