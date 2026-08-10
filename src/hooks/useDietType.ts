import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { DietType } from "@/data/bloodMarkerExplanations";

/**
 * The member's diet type, used so nutrition guidance never suggests meat or
 * dairy to someone who doesn't eat it. Falls back to "unknown" (shows all
 * options) when we have nothing recorded.
 */
export function useDietType(): DietType {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-diet-type", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DietType> => {
      const { data, error } = await supabase
        .from("user_health_profile")
        .select("diet")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return "unknown";
      const raw = (data?.diet ?? "").toLowerCase();
      if (raw.includes("vegan")) return "vegan";
      if (raw.includes("vegetarian")) return "vegetarian";
      if (raw.includes("pescat")) return "omnivore";
      if (raw) return "omnivore";
      return "unknown";
    },
  });
  return data ?? "unknown";
}
