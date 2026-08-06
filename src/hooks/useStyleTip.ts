// useStyleTip — the Current Hairstyle screen's guidance, generated at runtime
// through the same grounded pipeline as every other tip (wash-day-tip edge
// function, `surface: "style"`). No styling education is hardcoded in the
// client; the tip regenerates when the user's style, tension, extensions,
// goals or clinical data change.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { loadStyleTipContext } from "@/hooks/useDynamicWashTip";
import type { GuidanceTip } from "@/lib/tipsRender";
import {
  hashString,
  loadResponsiveSignals,
  responsiveSignatureParts,
  styleSignatureParts,
} from "@/lib/tipSignature";

interface StyleTipPayload {
  headline: string;
  why: string;
  technique: string;
}

export function useStyleTip() {
  const { user } = useAuth();
  const { level } = useTipsLevel();

  return useQuery({
    queryKey: ["style_tip_v1", user?.id, level],
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<GuidanceTip[]> => {
      if (!user?.id) return [];
      const [ctx, signals] = await Promise.all([
        loadStyleTipContext(user.id),
        loadResponsiveSignals(user.id),
      ]);
      const h = ctx.hair as Record<string, unknown> | null;
      const he = ctx.health as Record<string, unknown> | null;
      const s = ctx.style as Record<string, unknown> | null;

      const fingerprint = hashString(
        [
          "style-tip-v2",
          String(h?.hair_type ?? ""),
          String(h?.porosity ?? ""),
          String(h?.density ?? ""),
          String(h?.scalp_condition ?? ""),
          ...styleSignatureParts(s),
          ctx.goals.map((g) => `${g.kind ?? ""}:${g.title ?? ""}`).sort().join("|"),
          ctx.bloodFlags.map((b) => `${b.marker}:${b.status}`).sort().join("|"),
          ...responsiveSignatureParts(signals),
          `tl${level}`,
        ].join("::"),
      );

      const { data, error } = await supabase.functions.invoke("wash-day-tip", {
        body: {
          surface: "style",
          fingerprint,
          hairProfile: h,
          healthProfile: he,
          currentStyle: s
            ? {
                current_hairstyle: s.current_hairstyle ?? null,
                planned_next_style: s.planned_next_style ?? null,
                current_style_tension: s.current_style_tension ?? null,
                current_style_extensions: s.current_style_extensions ?? null,
                planned_style_tension: s.planned_style_tension ?? null,
                planned_style_extensions: s.planned_style_extensions ?? null,
              }
            : null,
          goals: ctx.goals.map((g) => ({ title: g.title, category: g.kind ?? undefined })),
          bloodFlags: ctx.bloodFlags,
          hasWashHistory: ctx.hasWashHistory,
          challenges: signals.challenges,
          areasOfConcern: signals.areasOfConcern,
          recentWashDay: signals.recentWashDay,
          recentAppointment: signals.recentAppointment,
          tipsLevel: level,
        },
      });

      if (error) {
        console.warn("[useStyleTip] invoke failed", error.message);
        return [];
      }
      const tip = (data as { tip?: StyleTipPayload } | null)?.tip;
      if (!tip?.headline) return [];

      const tips: GuidanceTip[] = [
        {
          priority: 10,
          short: tip.headline,
          why: tip.why,
          alwaysShow: true,
        },
      ];
      if (tip.technique) {
        tips.push({ priority: 5, short: tip.technique });
      }
      return tips;
    },
  });
}
