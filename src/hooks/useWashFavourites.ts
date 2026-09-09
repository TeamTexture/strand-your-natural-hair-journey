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
  /** Set only on the "Tool 1".."Tool 3" slots. */
  tool_id?: string | null;
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

/**
 * Steps she has marked as skipped by default. Stored as a favourites row with
 * no product against it, so nothing else about the table changes.
 */
export function useWashFavouriteSkips() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wash-favourite-skips", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("wash_day_favourites")
        .select("step, product_id, tool_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return ((data ?? []) as WashFavourite[])
        // A tool slot carries no product — it is not a skipped step.
        .filter((row) => !row.product_id && !row.tool_id && !WASH_TOOL_SLOTS.includes(row.step))
        .map((row) => row.step);
    },
  });
}

/** Her default tools, in slot order — up to three, may be empty. */
export function useWashFavouriteTools() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wash-favourite-tools", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("wash_day_favourites")
        .select("step, product_id, tool_id")
        .eq("user_id", user!.id)
        .in("step", WASH_TOOL_SLOTS as string[]);
      if (error) throw error;
      const rows = (data ?? []) as WashFavourite[];
      return WASH_TOOL_SLOTS.map(
        (slot) => rows.find((r) => r.step === slot)?.tool_id ?? null,
      ).filter((id): id is string => !!id);
    },
  });
}

/** Replace the whole favourites set. Applies from the next wash day forward. */
export function useSaveWashFavourites() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, string | null> | {
      map: Record<string, string | null>;
      /** Steps marked "skip by default" — kept as a product-less row. */
      skipped?: readonly string[];
      /** Her default tools, in order — up to three. */
      tools?: readonly string[];
    }) => {
      if (!user) throw new Error("Please sign in first.");
      const map = "map" in input ? input.map : input;
      const skipped = new Set(("map" in input ? input.skipped : undefined) ?? []);
      const tools = "map" in input ? input.tools : undefined;
      const entries = Object.entries(map);
      const setRows: Array<{
        user_id: string;
        step: string;
        product_id: string | null;
        tool_id?: string | null;
      }> = entries
        .filter(([step, id]) => !!id || skipped.has(step))
        .map(([step, id]) => ({
          user_id: user.id,
          step,
          product_id: skipped.has(step) ? null : (id as string),
        }));
      const clearSteps = entries
        .filter(([step, id]) => !id && !skipped.has(step))
        .map(([step]) => step);

      // Tool slots are only touched when the caller passed a tools list.
      if (tools) {
        const picked = tools.filter(Boolean).slice(0, WASH_TOOL_SLOTS.length);
        WASH_TOOL_SLOTS.forEach((slot, i) => {
          const toolId = picked[i];
          if (toolId) {
            setRows.push({ user_id: user.id, step: slot, product_id: null, tool_id: toolId });
          } else {
            clearSteps.push(slot);
          }
        });
      }


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
      void qc.invalidateQueries({ queryKey: ["wash-favourite-skips", user?.id] });
    },
  });
}
