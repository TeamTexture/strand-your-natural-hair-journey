// useDynamicWashTip — generates & caches a personalised wash-day tip per user.
//
// Builds a stable fingerprint from the user's live data (hair profile, health,
// blood flags, goals, current style, wash history presence). The edge function
// caches the tip against that fingerprint so identical inputs return instantly
// and don't burn tokens. The tip only regenerates when the user's data
// actually changes — consistent with STRAND's static-page behaviour.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHairProfile } from "@/hooks/useHairProfile";
import { useHealthProfile } from "@/hooks/useHealthProfile";
import { useStyleProfile } from "@/hooks/useStyleProfile";
import { useGoals } from "@/hooks/useGoals";
import { useBloodValues } from "@/hooks/useBloodValues";
import { useWashDays } from "@/hooks/useWashDays";

export interface DynamicWashTip {
  headline: string;
  why: string;
  technique: string;
}

const hashString = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

export function useDynamicWashTip() {
  const { user } = useAuth();
  const { data: hair } = useHairProfile();
  const { data: health } = useHealthProfile();
  const { data: style } = useStyleProfile();
  const { data: goals = [] } = useGoals();
  const { data: bloods = [] } = useBloodValues();
  const { data: washDays = [] } = useWashDays();

  const bloodFlags = useMemo(
    () =>
      bloods
        .filter((b) => b.status && b.status.toLowerCase() !== "normal")
        .map((b) => ({ marker: b.marker, status: b.status, value: b.value })),
    [bloods],
  );

  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => (g.status ?? "active") === "active")
        .slice(0, 5)
        .map((g) => ({ title: g.title, category: g.category })),
    [goals],
  );

  const fingerprint = useMemo(() => {
    if (!user?.id) return null;
    const parts = [
      hair?.hair_type ?? "",
      hair?.porosity ?? "",
      hair?.density ?? "",
      hair?.scalp_condition ?? "",
      health?.overall_health ?? "",
      style?.current_hairstyle ?? "",
      washDays.length > 0 ? "wash" : "no-wash",
      bloodFlags.map((b) => `${b.marker}:${b.status}`).sort().join("|"),
      activeGoals.map((g) => `${g.category ?? ""}:${g.title ?? ""}`).sort().join("|"),
    ];
    return hashString(parts.join("::"));
  }, [user?.id, hair, health, style, washDays.length, bloodFlags, activeGoals]);

  return useQuery({
    queryKey: ["wash_day_tip", user?.id, fingerprint],
    enabled: !!user?.id && !!fingerprint,
    // Tip is stable while data is unchanged — behaves like a static section.
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<DynamicWashTip | null> => {
      if (!fingerprint) return null;
      const { data, error } = await supabase.functions.invoke("wash-day-tip", {
        body: {
          fingerprint,
          hairProfile: hair ?? null,
          healthProfile: health ?? null,
          currentStyle: style
            ? {
                current_hairstyle: style.current_hairstyle,
                days_in_style: style.days_in_style,
                planned_next_style: style.planned_next_style,
              }
            : null,
          goals: activeGoals,
          bloodFlags,
          hasWashHistory: washDays.length > 0,
        },
      });
      if (error) {
        console.warn("[useDynamicWashTip] invoke failed", error.message);
        return null;
      }
      const tip = (data as { tip?: DynamicWashTip } | null)?.tip ?? null;
      return tip;
    },
  });
}
