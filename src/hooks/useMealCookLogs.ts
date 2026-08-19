import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { convertHeicToJpeg } from "@/lib/imagePrep";

export interface MealCookLog {
  id: string;
  meal_id: string;
  photo_path: string | null;
  rating: number;
  cooked_at: string;
}

export const mealCookLogsKey = (userId?: string) => ["meal-cook-logs", userId ?? "anon"] as const;

const BUCKET = "journal-photos";

/**
 * Cook logs for the signed-in member's saved meals. Logs are immutable by
 * design — there is no update path, and `cooked_at` is always the database
 * default, never a client-supplied timestamp.
 */
export const useMealCookLogs = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: mealCookLogsKey(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<MealCookLog[]> => {
      const { data, error } = await supabase
        .from("meal_cook_logs")
        .select("id, meal_id, photo_path, rating, cooked_at")
        .eq("user_id", user!.id)
        .order("cooked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        meal_id: row.meal_id as string,
        photo_path: (row.photo_path as string | null) ?? null,
        rating: Number(row.rating ?? 0),
        cooked_at: row.cooked_at as string,
      }));
    },
  });

  const log = useMutation({
    mutationFn: async ({
      mealId,
      rating,
      photo,
    }: {
      mealId: string;
      rating: number;
      photo?: File | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      let photoPath: string | null = null;
      if (photo) {
        const prepared = await convertHeicToJpeg(photo).catch(() => photo);
        const ext = (prepared.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
        const path = `${userData.user.id}/meal-logs/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, prepared, {
          contentType: prepared.type || "image/jpeg",
          upsert: false,
        });
        if (upErr) console.error("[meal-log] photo upload failed", upErr);
        else photoPath = path;
      }

      // cooked_at is deliberately omitted — the database stamps it.
      const { error } = await supabase.from("meal_cook_logs").insert({
        user_id: userData.user.id,
        meal_id: mealId,
        rating,
        photo_path: photoPath,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mealCookLogsKey(user?.id) }),
  });

  return { ...query, logs: query.data ?? [], log };
};

/** Sign a meal-log photo path for display. */
export async function signMealLogPhoto(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
