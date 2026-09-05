// The member's DURABLE, PLAINTEXT hair characteristics — the small slice the
// instant (no-AI) guidance surfaces need.
//
// Deliberately NOT buildAiContext(): that assembles the full clinical payload
// (blood, health, decryption round-trips) and is far too heavy for a surface
// that must paint the moment she taps Save. Only the unencrypted columns are
// read here; encrypted scalp/diagnosed data stays out and is handled
// server-side by the AI surfaces that genuinely need it.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { HairCharacteristics } from "@/lib/dailyLogGuidance";

export function useHairCharacteristics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hair-characteristics", user?.id],
    enabled: !!user,
    // Durable data — it changes when she edits her profile, not on a clock.
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<HairCharacteristics | null> => {
      const { data, error } = await supabase
        .from("user_hair_profile")
        .select("porosity, density, diameter, elasticity, surface_texture, areas_of_concern")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as HairCharacteristics | null) ?? null;
    },
  });
}
