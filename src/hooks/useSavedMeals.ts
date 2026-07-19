import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export const useSavedMeals = () => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["saved-meals"],
    queryFn: async (): Promise<SavedMeal[]> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
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
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-meals"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_saved_meals")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-meals"] }),
  });

  return { ...query, save, remove };
};
