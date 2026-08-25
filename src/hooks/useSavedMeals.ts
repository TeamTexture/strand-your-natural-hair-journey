import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

export interface SavedMeal {
  id: string;
  name: string;
  emoji: string | null;
  cuisine: string | null;
  time_minutes: number | null;
  summary: string | null;
  targets: string[];
  ingredients: string[];
  steps: string[];
  created_at: string;
}

export interface MealDraft {
  name: string;
  emoji?: string | null;
  cuisine?: string | null;
  time_minutes?: number | null;
  summary?: string | null;
  targets?: string[];
  ingredients?: string[];
  steps?: string[];
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Normalised meal identity — the same rule as the database's generated
 * `name_key` column (trimmed, case-insensitive, collapsed whitespace), so the
 * client, the exclusion list and the unique index all agree on what counts as
 * "the same meal".
 */
export const mealKey = (name: string | null | undefined): string =>
  (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export const savedMealsKey = (userId?: string) => ["saved-meals", userId ?? "anon"] as const;

export const useSavedMeals = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    // Scoped to the signed-in member. An unscoped key would let one account's
    // saved meals be served from cache to the next account in the same tab.
    queryKey: savedMealsKey(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<SavedMeal[]> => {
      const { data: userData } = await getDisplayedAuthUser();
      if (!userData.user || userData.user.id !== user?.id) return [];
      const { data, error } = await supabase
        .from("user_saved_meals")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        emoji: (row.emoji as string | null) ?? null,
        cuisine: (row.cuisine as string | null) ?? null,
        time_minutes: (row.time_minutes as number | null) ?? null,
        summary: (row.summary as string | null) ?? null,
        targets: asStringArray(row.targets),
        ingredients: asStringArray(row.ingredients),
        steps: asStringArray(row.steps),
        created_at: row.created_at as string,
      }));
    },
  });

  const save = useMutation({
    mutationFn: async (draft: MealDraft) => {
      const { data: userData } = await getDisplayedAuthUser();
      if (!userData.user) throw new Error("Not signed in");
      // Idempotent save: if she has already saved this meal, silently succeed
      // rather than surfacing a unique-violation to her.
      const key = mealKey(draft.name);
      const { data: existing } = await supabase
        .from("user_saved_meals")
        .select("id, name")
        .eq("user_id", userData.user.id);
      if ((existing ?? []).some((row) => mealKey(row.name as string) === key)) return;

      const { error } = await supabase.from("user_saved_meals").insert({
        user_id: userData.user.id,
        name: draft.name,
        emoji: draft.emoji ?? null,
        cuisine: draft.cuisine ?? null,
        time_minutes: draft.time_minutes ?? null,
        summary: draft.summary ?? null,
        targets: draft.targets ?? [],
        ingredients: draft.ingredients ?? [],
        steps: draft.steps ?? [],
      });
      // 23505 = the unique index caught a race (double tap). Treat as saved.
      if (error && (error as { code?: string }).code !== "23505") throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savedMealsKey(user?.id) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await getDisplayedAuthUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_saved_meals")
        .delete()
        .eq("id", id)
        .eq("user_id", userData.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savedMealsKey(user?.id) }),
  });

  return { ...query, save, remove };
};
