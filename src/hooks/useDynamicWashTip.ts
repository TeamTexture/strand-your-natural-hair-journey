// useDynamicWashTip — generates & caches a personalised wash-day tip per user.
//
// Builds a stable fingerprint from the user's live data (hair profile, health,
// blood flags, goals, current style, wash history presence). The edge function
// caches the tip against that fingerprint so identical inputs return instantly
// and don't burn tokens. The tip only regenerates when the user's data
// actually changes — consistent with STRAND's static-page behaviour.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";

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

export async function loadStyleTipContext(userId: string) {
  return loadContext(userId);
}

async function loadContext(userId: string) {
  const [
    hairRes,
    healthRes,
    styleRes,
    goalsRes,
    bloodsRes,
    washRes,
  ] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_goals")
      .select("title, kind, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    supabase
      .from("blood_results")
      .select("marker, value, unit, status, category")
      .eq("user_id", userId),
    supabase.from("wash_days").select("id").eq("user_id", userId).limit(1),
  ]);

  const hair = hairRes.data as Record<string, unknown> | null;
  const health = healthRes.data as Record<string, unknown> | null;
  const style = styleRes.data as Record<string, unknown> | null;
  const goals = (goalsRes.data ?? []) as Array<{ title: string; kind: string | null; status: string | null }>;
  const bloodFlags = (bloodsRes.data ?? [])
    .filter((b) => b.status && String(b.status).toLowerCase() !== "normal")
    .map((b) => ({ marker: b.marker, status: b.status, value: b.value }));
  const hasWashHistory = (washRes.data ?? []).length > 0;

  return { hair, health, style, goals, bloodFlags, hasWashHistory };
}

export function useDynamicWashTip() {
  const { user } = useAuth();
  const { level } = useTipsLevel();

  return useQuery({
    queryKey: ["wash_day_tip_v1", user?.id, level],
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<DynamicWashTip | null> => {
      if (!user?.id) return null;
      const [ctx, signals] = await Promise.all([
        loadContext(user.id),
        loadResponsiveSignals(user.id),
      ]);
      const h = ctx.hair as { hair_type?: string; porosity?: string; density?: string; scalp_condition?: string } | null;
      const he = ctx.health as { overall_health?: string } | null;
      const s = ctx.style as {
        current_hairstyle?: string;
        days_in_style?: number | null;
        planned_next_style?: string | null;
        current_style_tension?: string | null;
        current_style_extensions?: boolean | null;
      } | null;
      const fingerprint = hashString(
        [
          "wash-tip-v2",
          h?.hair_type ?? "",
          h?.porosity ?? "",
          h?.density ?? "",
          h?.scalp_condition ?? "",
          he?.overall_health ?? "",
          ...styleSignatureParts(ctx.style as Record<string, unknown> | null),
          ctx.hasWashHistory ? "wash" : "no-wash",
          ctx.bloodFlags.map((b) => `${b.marker}:${b.status}`).sort().join("|"),
          ctx.goals.map((g) => `${g.kind ?? ""}:${g.title ?? ""}`).sort().join("|"),
          ...responsiveSignatureParts(signals),
        ].join("::"),
      );

      const { data, error } = await supabase.functions.invoke("wash-day-tip", {
        body: {
          fingerprint,
          hairProfile: h,
          healthProfile: he,
          currentStyle: s
            ? {
                current_hairstyle: s.current_hairstyle,
                days_in_style: s.days_in_style,
                planned_next_style: s.planned_next_style,
                current_style_tension: s.current_style_tension ?? null,
                current_style_extensions: s.current_style_extensions ?? null,
                planned_style_tension:
                  (ctx.style as Record<string, unknown> | null)?.planned_style_tension ?? null,
                planned_style_extensions:
                  (ctx.style as Record<string, unknown> | null)?.planned_style_extensions ?? null,
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
        console.warn("[useDynamicWashTip] invoke failed", error.message);
        return null;
      }
      return (data as { tip?: DynamicWashTip } | null)?.tip ?? null;
    },
  });
}
