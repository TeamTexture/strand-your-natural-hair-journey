import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canonDiet, type DietaryPattern } from "@/lib/dietaryPattern";

export interface DietProfile {
  pattern: DietaryPattern;
  /** What an "Other" member told us they avoid. Empty unless known. */
  other: string;
}

/**
 * The member's dietary pattern, used so nutritional guidance never suggests a
 * food they exclude. An unrecognised or missing value is "unknown" — it is
 * never assumed to be omnivore, because that would show meat to someone who
 * does not eat it.
 */
export function useDietProfile(): DietProfile {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-diet-type", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DietProfile> => {
      const { data, error } = await supabase
        .from("user_health_profile")
        .select("diet, diet_other")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return { pattern: "unknown", other: "" };
      return {
        pattern: canonDiet(data?.diet),
        other: data?.diet_other ?? "",
      };
    },
  });
  return data ?? { pattern: "unknown", other: "" };
}

/** Convenience: just the canonical pattern. */
export function useDietType(): DietaryPattern {
  return useDietProfile().pattern;
}
