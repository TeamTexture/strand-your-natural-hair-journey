// useStyleTip — the Current Hairstyle screen's guidance, generated at runtime
// through the same grounded pipeline as every other tip (wash-day-tip edge
// function, `surface: "style"`). No styling education is hardcoded in the
// client; the tip regenerates when the user's style, tension, extensions,
// goals or clinical data change.

import { useQuery } from "@tanstack/react-query";
import { readLastGood, writeLastGood } from "@/lib/lastGoodTip";
import { useCurrentStyleToken } from "@/hooks/useCurrentStyleToken";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { loadStyleTipContext } from "@/hooks/useDynamicWashTip";
import type { GuidanceTip } from "@/lib/tipsRender";
import { aiInvoke } from "@/lib/aiInvoke";
import {
  hashString,
  loadResponsiveSignals,
  responsiveSignatureParts,
  styleSignatureParts,
} from "@/lib/tipSignature";

interface StyleTipPayload {
  headline: string;
  action: string;
  /** WHY the action matters — required at every level. */
  reason: string;
  why: string;
  technique: string;
}

interface StyleTipResponse {
  tip?: StyleTipPayload;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

export function useStyleTip() {
  const { user } = useAuth();
  const { level, ready: levelReady } = useTipsLevel();
  // Last-good copy is scoped to the style it was written for — never render a
  // tip about a style she no longer wears.
  const { token: styleToken, ready: styleReady } = useCurrentStyleToken();

  return useQuery({
    queryKey: ["style_tip_v2_procedural", user?.id, level, styleToken],
    enabled: !!user?.id && levelReady && styleReady,
    staleTime: Infinity,
    gcTime: Infinity,
    // Stale-while-revalidate — see src/lib/lastGoodTip.ts.
    placeholderData: () =>
      readLastGood<GuidanceTip[]>("style-tip", level, styleToken, (t) =>
        Array.isArray(t) && t.length > 0),
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
          "style-tip-v6-reason",
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

      const { data, error } = await aiInvoke<StyleTipResponse>("wash-day-tip", {
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
      });

      if (error) {
        console.warn("[useStyleTip] invoke failed", errorMessage(error));
        return [];
      }
      const tip = data?.tip;
      if (!tip?.headline) return [];

      const tips: GuidanceTip[] = [
        {
          priority: 10,
          short: tip.headline,
          // The action sentence leads the "why" so it survives condensing at
          // the minimal support level — a headline alone is never a tip.
          why: [tip.action, tip.reason, tip.why].filter(Boolean).join(" "),
          alwaysShow: true,
        },
      ];
      if (tip.technique) {
        tips.push({ priority: 5, short: tip.technique });
      }
      writeLastGood<GuidanceTip[]>("style-tip", tips, level, styleToken, (t) =>
        Array.isArray(t) && t.length > 0);
      return tips;
    },
  });
}
